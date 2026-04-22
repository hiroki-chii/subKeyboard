use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::collections::HashMap;
use std::time::{Instant, Duration};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::{
    GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE,
    RAWINPUTHEADER, RID_INPUT, RIDEV_INPUTSINK,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_KEYBOARD, KEYBDINPUT, SendInput, 
    KEYEVENTF_KEYUP, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_SCANCODE, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    WM_INPUT, WM_USER, MSG, PM_REMOVE, PeekMessageW,
    SetWindowsHookExW, UnhookWindowsHookEx, CallNextHookEx,
    WH_KEYBOARD_LL, HHOOK, KBDLLHOOKSTRUCT, LLKHF_INJECTED,
    PostMessageW,
};
use windows::Win32::UI::Shell::{SetWindowSubclass, DefSubclassProc};
use serde::{Serialize, Deserialize};

const SUBCLASS_ID: usize = 12345;
const WM_REINJECT_CHECK: u32 = WM_USER + 1001;

#[derive(Clone, Copy)]
struct Sendable<T>(T);
unsafe impl<T> Send for Sendable<T> {}
unsafe impl<T> Sync for Sendable<T> {}

static INPUT_STATE: Lazy<Mutex<Option<InputState>>> = Lazy::new(|| Mutex::new(None));
static HOOK_HANDLE: Lazy<Mutex<Option<Sendable<HHOOK>>>> = Lazy::new(|| Mutex::new(None));

struct InputState {
    sub_keyboard_handle: Option<isize>,
    learning_mode: bool,
    event_sender: tauri::async_runtime::Sender<InputEvent>,
    main_hwnd: Sendable<HWND>,
    device_map: HashMap<u16, (isize, Instant)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub name: String,
    pub handle: isize,
}

pub enum InputEvent {
    MacroTrigger { key_code: u16, state: KeyState, device_handle: isize },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum KeyState {
    Down,
    Up,
}

pub struct InputManager {
    event_sender: tauri::async_runtime::Sender<InputEvent>,
}

impl InputManager {
    pub fn new(event_sender: tauri::async_runtime::Sender<InputEvent>) -> Self {
        Self { event_sender }
    }

    pub fn set_sub_keyboard(&self, handle: Option<isize>) {
        if let Ok(mut state) = INPUT_STATE.lock() {
            if let Some(s) = state.as_mut() {
                s.sub_keyboard_handle = handle;
            }
        }
    }

    pub fn set_learning_mode(&self, enabled: bool) {
        if let Ok(mut state) = INPUT_STATE.lock() {
            if let Some(s) = state.as_mut() {
                s.learning_mode = enabled;
            }
        }
    }

    pub fn start_listening(&self, main_hwnd: HWND) {
        let _sender = self.event_sender.clone();
        if let Ok(mut state) = INPUT_STATE.lock() {
            if state.is_none() {
                *state = Some(InputState {
                    sub_keyboard_handle: None,
                    learning_mode: false,
                    event_sender: _sender,
                    main_hwnd: Sendable(main_hwnd),
                    device_map: HashMap::new(),
                });
            }
        }

        unsafe {
            let rid = RAWINPUTDEVICE {
                usUsagePage: 0x01,
                usUsage: 0x06,
                dwFlags: RIDEV_INPUTSINK, 
                hwndTarget: main_hwnd,
            };
            let _ = RegisterRawInputDevices(&[rid], std::mem::size_of::<RAWINPUTDEVICE>() as u32);

            let _ = SetWindowSubclass(main_hwnd, Some(main_window_subclass), SUBCLASS_ID, 0);

            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_proc), None, 0).ok();
            if let Some(h) = hook {
                *HOOK_HANDLE.lock().unwrap() = Some(Sendable(h));
            }
        }
    }
}

unsafe extern "system" fn low_level_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let kbd = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        if (kbd.flags.0 & LLKHF_INJECTED.0) != 0 {
            return CallNextHookEx(None, code, wparam, lparam);
        }

        if let Ok(state) = INPUT_STATE.lock() {
            if let Some(s) = state.as_ref() {
                let vk = kbd.vkCode;
                let scan = kbd.scanCode;
                let flags = kbd.flags.0;
                let msg = wparam.0 as u32;
                let pw = ((scan << 16) | (vk & 0xFFFF)) as usize;
                let pl = (((msg as u64) << 32) | (flags as u64)) as isize;
                let _ = PostMessageW(Some(s.main_hwnd.0), WM_REINJECT_CHECK, WPARAM(pw), LPARAM(pl));
                return LRESULT(1);
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

unsafe extern "system" fn main_window_subclass(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _ref_data: usize,
) -> LRESULT {
    match msg {
        WM_INPUT => {
            handle_raw_input(lparam.0);
            return LRESULT(0);
        }
        WM_REINJECT_CHECK => {
            handle_reinject_check(wparam, lparam);
            return LRESULT(0);
        }
        _ => {}
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

unsafe fn handle_reinject_check(wparam: WPARAM, lparam: LPARAM) {
    let vk = (wparam.0 & 0xFFFF) as u16;
    let scan = (wparam.0 >> 16) as u16;
    let flags = (lparam.0 & 0xFFFFFFFF) as u32;
    let msg = (lparam.0 >> 32) as u32;

    // 非同期判定の直前で、たまっている WM_INPUT をすべて吸い出して device_map を最新にする
    sync_raw_input();
    
    if let Ok(state) = INPUT_STATE.lock() {
        if let Some(s) = state.as_ref() {
            let mut device_handle = 0isize;
            let mut is_found = false;

            if let Some((handle, time)) = s.device_map.get(&vk) {
                // 判定窓を少し広めにとる
                if time.elapsed() < Duration::from_millis(200) {
                    device_handle = *handle;
                    is_found = true;
                }
            }

            let is_sub = if is_found {
                s.sub_keyboard_handle.map(|h| h == device_handle).unwrap_or(false)
            } else {
                false
            };

            let key_state = if (flags & 0x80) != 0 { KeyState::Up } else { KeyState::Down };

            if is_sub && !s.learning_mode {
                let _ = s.event_sender.try_send(InputEvent::MacroTrigger {
                    key_code: vk,
                    state: key_state,
                    device_handle,
                });
            } else {
                re_inject_values(vk, scan, flags, msg);
                if s.learning_mode {
                    let _ = s.event_sender.try_send(InputEvent::MacroTrigger {
                        key_code: vk,
                        state: key_state,
                        device_handle,
                    });
                }
            }
        }
    }
}

unsafe fn sync_raw_input() {
    let mut msg = MSG::default();
    // 全てのウィンドウのキューにある WM_INPUT を先行処理
    while PeekMessageW(&mut msg, None, WM_INPUT, WM_INPUT, PM_REMOVE).as_bool() {
        handle_raw_input(msg.lParam.0);
    }
}

unsafe fn handle_raw_input(lparam: isize) {
    let mut size = 0u32;
    let header_size = std::mem::size_of::<RAWINPUTHEADER>() as u32;
    if GetRawInputData(HRAWINPUT(lparam as *mut _), RID_INPUT, None, &mut size, header_size) != u32::MAX {
        let mut buffer = vec![0u8; size as usize];
        if GetRawInputData(HRAWINPUT(lparam as *mut _), RID_INPUT, Some(buffer.as_mut_ptr() as *mut _), &mut size, header_size) == size {
            let raw = &*(buffer.as_ptr() as *const RAWINPUT);
            if raw.header.dwType == 1 {
                let keyboard = raw.data.keyboard;
                let vk = keyboard.VKey;
                let handle = raw.header.hDevice.0 as isize;
                if let Ok(mut state) = INPUT_STATE.lock() {
                    if let Some(s) = state.as_mut() {
                        s.device_map.insert(vk, (handle, Instant::now()));
                    }
                }
            }
        }
    }
}

unsafe fn re_inject_values(vk: u16, scan: u16, flags: u32, msg: u32) {
    let mut f = KEYEVENTF_SCANCODE;
    if (flags & 0x01) != 0 { f |= KEYEVENTF_EXTENDEDKEY; }
    if msg == 0x101 || msg == 0x105 { f |= KEYEVENTF_KEYUP; }
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: scan,
                dwFlags: f,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
}

pub fn cleanup() {
    let mut hook = HOOK_HANDLE.lock().unwrap();
    if let Some(h) = hook.take() {
        unsafe { let _ = UnhookWindowsHookEx(h.0); }
    }
}
