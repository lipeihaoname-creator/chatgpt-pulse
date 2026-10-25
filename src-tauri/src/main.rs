#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    if chatgpt_pulse::startup_cli() {
        return;
    }
    if let Err(error) = chatgpt_pulse::run() {
        chatgpt_pulse::report_launch_error(&error);
        std::process::exit(1);
    }
}
