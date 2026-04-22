mod input_manager;
mod macro_executor;

use input_manager::{InputManager, InputEvent, DeviceInfo, KeyState};
use macro_executor::{MacroExecutor, MacroAction};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use windows::Win32::UI::Input::{GetRawInputDeviceList, RAWINPUTDEVICELIST, RIM_TYPEKEYBOARD};
use std::fs;
use std::path::PathBuf;

struct AppState {
    input_manager: InputManager,
    macros: Mutex<HashMap<u16, MacroAction>>,
    learning_mode: Mutex<bool>,
    config_path: PathBuf,
}

#[tauri::command]
fn get_keyboards() -> Vec<DeviceInfo> {
    let mut devices = Vec::new();
    unsafe {
        let mut count = 0u32;
        GetRawInputDeviceList(None, &mut count, std::mem::size_of::<RAWINPUTDEVICELIST>() as u32);
        
        let mut list = vec![RAWINPUTDEVICELIST::default(); count as usize];
        GetRawInputDeviceList(Some(list.as_mut_ptr()), &mut count, std::mem::size_of::<RAWINPUTDEVICELIST>() as u32);
        
        for dev in list {
            if dev.dwType == RIM_TYPEKEYBOARD {
                devices.push(DeviceInfo {
                    name: format!("Keyboard ({:?})", dev.hDevice),
                    handle: dev.hDevice.0 as isize,
                });
            }
        }
    }
    devices
}

#[tauri::command]
fn set_sub_keyboard(state: tauri::State<Arc<AppState>>, handle: Option<isize>) {
    state.input_manager.set_sub_keyboard(handle);
}

#[tauri::command]
fn set_learning_mode(state: tauri::State<Arc<AppState>>, enabled: bool) {
    let mut mode = state.learning_mode.lock().unwrap();
    *mode = enabled;
    state.input_manager.set_learning_mode(enabled);
}

#[tauri::command]
fn update_macro(state: tauri::State<Arc<AppState>>, key_code: u16, action: MacroAction) -> Result<(), String> {
    eprintln!("Updating macro for key: {}, action: {:?}", key_code, action);
    
    let mut macros = state.macros.lock().unwrap();
    macros.insert(key_code, action);
    
    // 保存
    let json = serde_json::to_string(&*macros).map_err(|e| e.to_string())?;
    fs::write(&state.config_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn get_macros(state: tauri::State<Arc<AppState>>) -> HashMap<u16, MacroAction> {
    state.macros.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (tx, mut rx) = tauri::async_runtime::channel::<InputEvent>(100);
    
    let input_manager = InputManager::new(tx);
    
    // 設定ファイルのパスを取得
    let home = dirs_next::home_dir().expect("Could not find home directory");
    let config_dir = home.join(".subkey");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).ok();
    }
    let config_path = config_dir.join("macros.json");

    // 初期ロード
    let initial_macros = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        HashMap::new()
    };

    let app_state = Arc::new(AppState {
        input_manager,
        macros: Mutex::new(initial_macros),
        learning_mode: Mutex::new(false),
        config_path,
    });

    let state_clone = Arc::clone(&app_state);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(move |app| {
            let main_window = app.get_webview_window("main").unwrap();
            let hwnd = main_window.hwnd().expect("Failed to get HWND");
            state_clone.input_manager.start_listening(hwnd);

            let handle = app.handle().clone();
            let state_for_thread = Arc::clone(&state_clone);
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        InputEvent::MacroTrigger { key_code, state, device_handle: _ } => {
                            if state == KeyState::Down {
                                let is_learning = *state_for_thread.learning_mode.lock().unwrap();
                                if is_learning {
                                    let _ = handle.emit("key-captured", key_code);
                                } else {
                                    let macros = state_for_thread.macros.lock().unwrap();
                                    if let Some(action) = macros.get(&key_code) {
                                        MacroExecutor::execute(action);
                                    }
                                }
                            }
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_keyboards,
            set_sub_keyboard,
            set_learning_mode,
            update_macro,
            get_macros
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // アプリ終了時にフックを解除
    input_manager::cleanup();
}
