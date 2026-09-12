mod commands;
#[cfg(target_os = "macos")]
mod mac;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ctx = tauri::generate_context!();
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .setup(|app| {
            #[cfg(target_os = "macos")]
            mac::window::setup_mac_window(app);

            #[cfg(not(target_os = "macos"))]
            let _ = app;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::folder::show_in_folder,
            commands::search::search_files
        ])
        .run(ctx)
        .expect("error while running tauri application");
}
