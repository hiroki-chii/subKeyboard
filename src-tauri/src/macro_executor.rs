use serde::{Serialize, Deserialize};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    KEYEVENTF_UNICODE,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
use windows::core::{HSTRING, PCWSTR};
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum MacroAction {
    Shortcut(Vec<u16>),    // VKey codes
    Text(String),          // String to type
    App(String),           // Path to .exe
    Url(String),           // URL to open
    Sequence(Vec<MacroAction>), // Recursive sequence
}

pub struct MacroExecutor;

impl MacroExecutor {
    pub fn execute(action: &MacroAction) {
        match action {
            MacroAction::Shortcut(keys) => {
                Self::send_shortcut(keys);
            }
            MacroAction::Text(text) => {
                Self::send_toggle_text(text);
            }
            MacroAction::App(path) => {
                Self::open_item(path);
            }
            MacroAction::Url(url) => {
                Self::open_item(url);
            }
            MacroAction::Sequence(actions) => {
                for a in actions {
                    Self::execute(a);
                    thread::sleep(Duration::from_millis(50));
                }
            }
        }
    }

    fn send_shortcut(keys: &[u16]) {
        let mut inputs = Vec::new();

        // Press all keys
        for &vk in keys {
            inputs.push(Self::create_key_input(vk, false));
        }
        // Release all keys in reverse order
        for &vk in keys.iter().rev() {
            inputs.push(Self::create_key_input(vk, true));
        }

        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    fn send_toggle_text(text: &str) {
        let mut inputs = Vec::new();
        for ch in text.encode_utf16() {
            // Key Down
            inputs.push(INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: ch,
                        dwFlags: KEYEVENTF_UNICODE,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            });
            // Key Up
            inputs.push(INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: ch,
                        dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            });
        }
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    fn open_item(path_or_url: &str) {
        unsafe {
            let wide_path = HSTRING::from(path_or_url);
            ShellExecuteW(
                None,
                PCWSTR(std::ptr::null()),
                PCWSTR(wide_path.as_ptr()),
                PCWSTR(std::ptr::null()),
                PCWSTR(std::ptr::null()),
                SW_SHOW,
            );
        }
    }

    fn create_key_input(vk: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() },
                    time: 0,
                    dwExtraInfo: 0, // Injected by macro, not to be re-swallowed
                },
            },
        }
    }
}
