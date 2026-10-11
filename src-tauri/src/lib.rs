/// Relays development diagnostics to the terminal that launched Tauri.
#[cfg(debug_assertions)]
#[tauri::command]
fn trace_execution(message: String) -> Result<(), String> {
  use std::io::{self, Write};
  let mut stdout = io::stdout().lock();
  writeln!(stdout, "{}", message).map_err(|error| error.to_string())?;
  stdout.flush().map_err(|error| error.to_string())
}

/// Starts the Viewer with a diagnostic command registered only in debug builds.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  #[cfg(debug_assertions)]
  let builder = builder.invoke_handler(tauri::generate_handler![trace_execution]);
  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
