// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
mod mac;
mod commands;

fn main() {
  let ctx = tauri::generate_context!();
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .setup(|app| {
      if cfg!(target_os = "macos") {
          #[cfg(target_os = "macos")]
          use mac::window::setup_mac_window;

          #[cfg(target_os = "macos")]
          setup_mac_window(app);
      }

        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        commands::folder::show_in_folder,
        commands::search::search_files
    ])
    .run(ctx)
    .expect("error while running tauri application");
}
