// Shout out to Hoppscotch for this window implementation
// https://github.com/hoppscotch/hoppscotch/blob/286fcd2bb08a84f027b10308d1e18da368f95ebf/packages/hoppscotch-selfhost-desktop/src-tauri/src/mac/window.rs

use hex_color::HexColor;
use tauri::{App, Manager, Runtime, WebviewWindow, WindowEvent};

use objc2::runtime::AnyObject;
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameVibrantDark,
    NSAppearanceNameVibrantLight, NSWindow, NSWindowButton, NSWindowTitleVisibility,
};

// If anything breaks on macOS, this should be the place which is broken
//
// NOTE for the Tauri v2 port: the v1 version of this file overrode Taos
// NSWindowDelegate with a custom delegate that forwarded every callback to the
// original delegate while emitting fullscreen events and repositioning the
// traffic light buttons. That delegate machinery relied on the cocoa and objc
// crates which were replaced by objc2. The custom delegate has been removed:
// fullscreen events were never consumed by the frontend, and traffic light
// repositioning on resize is now handled through WindowEvent::Resized instead.

const WINDOW_CONTROL_PAD_X: f64 = 10.0;
const WINDOW_CONTROL_PAD_Y: f64 = 16.0;

pub trait WindowExt {
    #[cfg(target_os = "macos")]
    fn set_transparent_titlebar(&self);
}

#[cfg(target_os = "macos")]
unsafe fn set_transparent_titlebar(ns_window: &NSWindow) {
    ns_window.setTitlebarAppearsTransparent(true);
    ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
}

struct UnsafeWindowHandle(*mut std::ffi::c_void);
unsafe impl Send for UnsafeWindowHandle {}
unsafe impl Sync for UnsafeWindowHandle {}

#[cfg(target_os = "macos")]
fn update_window_theme(window: &WebviewWindow, color: HexColor) {
    let brightness = (color.r as u64 + color.g as u64 + color.b as u64) / 3;

    let window_handle = UnsafeWindowHandle(window.ns_window().unwrap());

    let _ = window.run_on_main_thread(move || {
        let handle = window_handle;

        unsafe {
            let ns_window = handle.0 as *mut AnyObject;

            let appearance_name = if brightness >= 128 {
                NSAppearanceNameVibrantLight
            } else {
                NSAppearanceNameVibrantDark
            };

            let appearance = NSAppearance::appearanceNamed(appearance_name);
            let ns_window = &*(ns_window as *const NSWindow);
            ns_window.setAppearance(appearance.as_deref());

            set_window_controls_pos(ns_window, WINDOW_CONTROL_PAD_X, WINDOW_CONTROL_PAD_Y);
        }
    });
}

#[cfg(target_os = "macos")]
unsafe fn set_window_controls_pos(ns_window: &NSWindow, x: f64, y: f64) {
    let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(miniaturize) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton)
    else {
        return;
    };
    let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) else {
        return;
    };

    let Some(title_bar_container_view) = close.superview().and_then(|v| v.superview()) else {
        return;
    };

    let close_rect = close.frame();
    let button_height = close_rect.size.height;

    let title_bar_frame_height = button_height + y;
    let mut title_bar_rect = title_bar_container_view.frame();
    title_bar_rect.size.height = title_bar_frame_height;
    title_bar_rect.origin.y = ns_window.frame().size.height - title_bar_frame_height;
    title_bar_container_view.setFrame(title_bar_rect);

    let window_buttons = [close, miniaturize, zoom];
    let space_between = window_buttons[1].frame().origin.x - window_buttons[0].frame().origin.x;

    for (i, button) in window_buttons.iter().enumerate() {
        let mut rect = button.frame();
        rect.origin.x = x + (i as f64 * space_between);
        button.setFrameOrigin(rect.origin);
    }
}

impl<R: Runtime> WindowExt for WebviewWindow<R> {
    #[cfg(target_os = "macos")]
    fn set_transparent_titlebar(&self) {
        unsafe {
            let ns_window = self.ns_window().unwrap() as *const NSWindow;

            set_transparent_titlebar(&*ns_window);

            set_window_controls_pos(&*ns_window, WINDOW_CONTROL_PAD_X, WINDOW_CONTROL_PAD_Y);
        }
    }
}

#[cfg(target_os = "macos")]
pub fn setup_mac_window(app: &mut App) {
    let window = app.get_webview_window("main").unwrap();

    window.set_transparent_titlebar();

    // Keep the traffic light position in sync on window resizes
    let controls_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Resized(_) = event {
            if let Ok(ptr) = controls_window.ns_window() {
                unsafe {
                    set_window_controls_pos(
                        &*(ptr as *const NSWindow),
                        WINDOW_CONTROL_PAD_X,
                        WINDOW_CONTROL_PAD_Y,
                    );
                }
            }
        }
    });

    let window_handle = window;
    update_window_theme(&window_handle, HexColor::WHITE);

    // Control window theme based on app update_window
    app.listen("tactile-bg-changed", move |ev| {
        let payload = serde_json::from_str::<&str>(ev.payload().unwrap())
            .unwrap()
            .trim();

        let color = HexColor::parse_rgb(payload).unwrap();

        update_window_theme(&window_handle, color);
    });
}
