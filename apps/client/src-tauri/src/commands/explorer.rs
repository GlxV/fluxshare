use std::env;
use std::fs;
use std::path::PathBuf;

use serde::Serialize;

use super::launch::EXPLORER_SHARE_FLAG;
use super::settings::SettingsManager;

const MENU_LABEL: &str = "Share with FluxShare";
#[cfg(target_os = "windows")]
const LAUNCHER_FILE_NAME: &str = "explorer-share.vbs";
#[cfg(target_os = "windows")]
const ICON_FILE_NAME: &str = "fluxshare-context.ico";
#[cfg(target_os = "windows")]
const EMBEDDED_ICON: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/icons/icon.ico"));

#[cfg(target_os = "windows")]
const PRIMARY_CONTEXT_MENU_KEY: &str = r"Software\Classes\*\shell\FluxShareShare";

#[cfg(target_os = "windows")]
const LEGACY_CONTEXT_MENU_KEYS: [&str; 4] = [
    r"Software\Classes\*\shell\FluxShare.Share",
    r"Software\Classes\*\shell\FluxShare.TestProbe",
    r"Software\Classes\AllFilesystemObjects\shell\FluxShare.Share",
    r"Software\Classes\SystemFileAssociations\*\shell\FluxShare.Share",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerIntegrationStatus {
    pub supported: bool,
    pub enabled: bool,
    pub desired_enabled: bool,
    pub menu_label: String,
    pub command: Option<String>,
    pub icon: Option<String>,
    pub note: Option<String>,
}

#[cfg(not(target_os = "windows"))]
impl ExplorerIntegrationStatus {
    fn unsupported(desired_enabled: bool) -> Self {
        Self {
            supported: false,
            enabled: false,
            desired_enabled,
            menu_label: MENU_LABEL.to_string(),
            command: None,
            icon: None,
            note: Some("Windows Explorer integration is only available on Windows.".to_string()),
        }
    }
}

#[cfg(target_os = "windows")]
#[derive(Debug)]
struct ExplorerRegistration {
    enabled: bool,
    command: Option<String>,
    icon: Option<String>,
    note: Option<String>,
}

fn current_executable() -> Result<PathBuf, String> {
    env::current_exe().map_err(|error| format!("failed to resolve current executable: {error}"))
}

#[cfg(target_os = "windows")]
fn local_shell_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("FluxShare")
        .join("shell")
}

#[cfg(target_os = "windows")]
fn launcher_path() -> PathBuf {
    local_shell_dir().join(LAUNCHER_FILE_NAME)
}

#[cfg(target_os = "windows")]
fn local_icon_path() -> PathBuf {
    local_shell_dir().join(ICON_FILE_NAME)
}

#[cfg(target_os = "windows")]
fn wscript_path() -> PathBuf {
    PathBuf::from(env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string()))
        .join("System32")
        .join("wscript.exe")
}

#[cfg(target_os = "windows")]
fn escape_vbs_string(value: &str) -> String {
    value.replace('"', "\"\"")
}

#[cfg(target_os = "windows")]
fn launcher_script_value(executable: &PathBuf) -> String {
    let exe = escape_vbs_string(&executable.to_string_lossy());
    format!(
        "Set shell = CreateObject(\"WScript.Shell\")\r\n\
Dim command\r\n\
command = Chr(34) & \"{exe}\" & Chr(34) & \" {flag}\"\r\n\
If WScript.Arguments.Count > 0 Then\r\n\
  command = command & \" \" & Chr(34) & WScript.Arguments.Item(0) & Chr(34)\r\n\
End If\r\n\
shell.Run command, 0, False\r\n",
        exe = exe,
        flag = EXPLORER_SHARE_FLAG
    )
}

#[cfg(target_os = "windows")]
fn ensure_shell_assets(executable: &PathBuf) -> Result<(PathBuf, PathBuf), String> {
    let shell_dir = local_shell_dir();
    fs::create_dir_all(&shell_dir)
        .map_err(|error| format!("failed to create shell asset directory: {error}"))?;

    let launcher = launcher_path();
    fs::write(&launcher, launcher_script_value(executable))
        .map_err(|error| format!("failed to write Explorer launcher: {error}"))?;

    let icon = local_icon_path();
    fs::write(&icon, EMBEDDED_ICON)
        .map_err(|error| format!("failed to write Explorer icon: {error}"))?;

    Ok((launcher, icon))
}

#[cfg(target_os = "windows")]
fn remove_shell_assets() -> Result<(), String> {
    for path in [launcher_path(), local_icon_path()] {
        match fs::remove_file(&path) {
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "failed to remove shell asset {}: {error}",
                    path.display()
                ))
            }
        }
    }

    let shell_dir = local_shell_dir();
    match fs::remove_dir(&shell_dir) {
        Ok(_) => {}
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty
            ) => {}
        Err(error) => {
            return Err(format!(
                "failed to remove shell asset directory {}: {error}",
                shell_dir.display()
            ))
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn command_value(launcher: &PathBuf) -> String {
    format!(
        "\"{}\" //B //Nologo \"{}\" \"%1\"",
        wscript_path().display(),
        launcher.display()
    )
}

#[cfg(target_os = "windows")]
fn icon_value(icon: &PathBuf) -> String {
    format!("\"{}\"", icon.display())
}

#[cfg(target_os = "windows")]
fn values_match(actual: &Option<String>, expected: &str) -> bool {
    actual
        .as_ref()
        .map(|value| value.trim().eq_ignore_ascii_case(expected.trim()))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn notify_explorer_changed() {
    use std::ptr;
    use windows_sys::Win32::UI::Shell::{
        SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_FLUSH, SHCNF_IDLIST,
    };

    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED as i32,
            SHCNF_IDLIST | SHCNF_FLUSH,
            ptr::null(),
            ptr::null(),
        );
    }
}

#[cfg(target_os = "windows")]
fn delete_registry_key(key_path: &str) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.delete_subkey_all(key_path) {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("failed to remove Explorer menu entry: {error}")),
    }
}

#[cfg(target_os = "windows")]
fn cleanup_legacy_registration() -> Result<(), String> {
    for key_path in LEGACY_CONTEXT_MENU_KEYS {
        delete_registry_key(key_path)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn read_registry_status(_executable: &PathBuf) -> Result<ExplorerRegistration, String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let launcher = launcher_path();
    let icon_path = local_icon_path();
    let expected_command = command_value(&launcher);
    let expected_icon = icon_value(&icon_path);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let key = match hkcu.open_subkey(PRIMARY_CONTEXT_MENU_KEY) {
        Ok(key) => key,
        Err(_) => {
            return Ok(ExplorerRegistration {
                enabled: false,
                command: None,
                icon: None,
                note: None,
            });
        }
    };

    let command = key
        .open_subkey("command")
        .ok()
        .and_then(|subkey| subkey.get_value::<String, _>("").ok());
    let icon = key.get_value::<String, _>("Icon").ok();
    let assets_ready = launcher.exists() && icon_path.exists();
    let enabled = assets_ready
        && values_match(&command, &expected_command)
        && values_match(&icon, &expected_icon);

    let note = if enabled {
        Some("Registered for the current FluxShare executable.".to_string())
    } else if !assets_ready && (command.is_some() || icon.is_some()) {
        Some("Explorer integration is missing local shell assets and will be repaired.".to_string())
    } else if command.is_some() || icon.is_some() {
        Some(
            "Explorer integration is registered with stale values and will be repaired."
                .to_string(),
        )
    } else {
        None
    };

    Ok(ExplorerRegistration {
        enabled,
        command,
        icon,
        note,
    })
}

#[cfg(target_os = "windows")]
fn write_registry_registration(executable: &PathBuf) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    cleanup_legacy_registration()?;
    let (launcher, icon_path) = ensure_shell_assets(executable)?;

    let (key, _) = hkcu
        .create_subkey(PRIMARY_CONTEXT_MENU_KEY)
        .map_err(|error| format!("failed to create Explorer menu key: {error}"))?;
    key.set_value("", &MENU_LABEL)
        .map_err(|error| format!("failed to set menu label: {error}"))?;
    key.set_value("Icon", &icon_value(&icon_path))
        .map_err(|error| format!("failed to set menu icon: {error}"))?;
    key.set_value("NeverDefault", &"")
        .map_err(|error| format!("failed to mark menu as non-default: {error}"))?;

    let (command_key, _) = key
        .create_subkey("command")
        .map_err(|error| format!("failed to create Explorer command key: {error}"))?;
    command_key
        .set_value("", &command_value(&launcher))
        .map_err(|error| format!("failed to set Explorer command: {error}"))?;

    notify_explorer_changed();
    Ok(())
}

#[cfg(target_os = "windows")]
fn delete_registry_registration() -> Result<(), String> {
    delete_registry_key(PRIMARY_CONTEXT_MENU_KEY)?;
    cleanup_legacy_registration()?;
    remove_shell_assets()?;
    notify_explorer_changed();
    Ok(())
}

#[cfg(target_os = "windows")]
fn desired_enabled(settings: &SettingsManager) -> Result<bool, String> {
    settings
        .get_settings()
        .map(|settings| settings.explorer_context_menu_enabled)
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn desired_enabled(settings: &SettingsManager) -> Result<bool, String> {
    settings
        .get_settings()
        .map(|settings| settings.explorer_context_menu_enabled)
        .map_err(|error| error.to_string())
}

pub fn sync_explorer_integration(settings: &SettingsManager) -> Result<(), String> {
    let should_enable = desired_enabled(settings)?;
    #[cfg(target_os = "windows")]
    {
        let executable = current_executable()?;
        if should_enable {
            write_registry_registration(&executable)?;
        } else {
            delete_registry_registration()?;
        }
    }
    Ok(())
}

fn update_desired_enabled(settings: &SettingsManager, enabled: bool) -> Result<(), String> {
    let mut current = settings.get_settings().map_err(|error| error.to_string())?;
    current.explorer_context_menu_enabled = enabled;
    settings.update(current).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_explorer_integration_status(
    settings: tauri::State<'_, SettingsManager>,
) -> Result<ExplorerIntegrationStatus, String> {
    let desired_enabled = desired_enabled(&settings)?;

    #[cfg(target_os = "windows")]
    {
        let executable = current_executable()?;
        let mut registration = read_registry_status(&executable)?;

        if desired_enabled && !registration.enabled {
            write_registry_registration(&executable)?;
            registration = read_registry_status(&executable)?;
            if registration.enabled {
                registration.note = Some(
                    "Explorer integration was repaired and Explorer was refreshed.".to_string(),
                );
            }
        }

        return Ok(ExplorerIntegrationStatus {
            supported: true,
            enabled: registration.enabled,
            desired_enabled,
            menu_label: MENU_LABEL.to_string(),
            command: registration.command,
            icon: registration.icon,
            note: registration.note,
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(ExplorerIntegrationStatus::unsupported(desired_enabled))
    }
}

#[tauri::command]
pub fn set_explorer_context_menu_enabled(
    settings: tauri::State<'_, SettingsManager>,
    enabled: bool,
) -> Result<ExplorerIntegrationStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let executable = current_executable()?;
        if enabled {
            write_registry_registration(&executable)?;
        } else {
            delete_registry_registration()?;
        }
    }

    update_desired_enabled(&settings, enabled)?;
    get_explorer_integration_status(settings)
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use std::path::PathBuf;

    use super::{
        command_value, delete_registry_registration, icon_value, read_registry_status,
        write_registry_registration,
    };

    #[test]
    fn builds_context_menu_command_with_flag_and_placeholder() {
        let launcher =
            PathBuf::from(r"C:\Users\Admin\AppData\Local\FluxShare\shell\explorer-share.vbs");
        let command = command_value(&launcher);
        assert!(command.eq_ignore_ascii_case(
            r#""C:\Windows\System32\wscript.exe" //B //Nologo "C:\Users\Admin\AppData\Local\FluxShare\shell\explorer-share.vbs" "%1""#
        ));
    }

    #[test]
    fn builds_context_menu_icon_for_current_executable() {
        let icon_path =
            PathBuf::from(r"C:\Users\Admin\AppData\Local\FluxShare\shell\fluxshare-context.ico");
        let icon = icon_value(&icon_path);
        assert_eq!(
            icon,
            r#""C:\Users\Admin\AppData\Local\FluxShare\shell\fluxshare-context.ico""#
        );
    }

    #[test]
    fn writes_and_reads_registry_registration() {
        let executable = PathBuf::from(r"C:\Program Files\FluxShare\FluxShare.exe");
        let _ = delete_registry_registration();
        write_registry_registration(&executable).expect("registration should be written");

        let registration =
            read_registry_status(&executable).expect("registration should be readable");
        assert!(registration.enabled);
        assert!(registration
            .command
            .as_deref()
            .map(|value| {
                value.eq_ignore_ascii_case(
                    r#""C:\Windows\System32\wscript.exe" //B //Nologo "C:\Users\Admin\AppData\Local\FluxShare\shell\explorer-share.vbs" "%1""#
                )
            })
            .unwrap_or(false));
        assert_eq!(
            registration.icon.as_deref(),
            Some(r#""C:\Users\Admin\AppData\Local\FluxShare\shell\fluxshare-context.ico""#)
        );

        delete_registry_registration().expect("registration should be removed");
    }
}
