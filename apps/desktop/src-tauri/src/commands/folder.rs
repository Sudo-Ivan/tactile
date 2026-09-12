#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::process::Command;

#[tauri::command]
#[allow(unused_variables)]
pub async fn show_in_folder(path: String) {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path]) // The comma after select is not a typo
            .spawn()
            .unwrap();
    }

    #[cfg(target_os = "linux")]
    {
        let path = Path::new(&path);
        let parent = path.parent().unwrap_or(path);
        Command::new("xdg-open").arg(parent).spawn().unwrap();
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").args(["-R", &path]).spawn().unwrap();
    }
}
