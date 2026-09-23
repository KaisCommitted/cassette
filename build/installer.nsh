; Extra steps for the Cassette installer, picked up by electron-builder.

; Updating the app replaces the icon inside Cassette.exe, but Windows keeps
; showing the old one on the desktop, Start menu and taskbar shortcuts from
; its icon cache. Telling the shell that file associations changed is what
; makes it read the icons again, so an update shows its new icon straight
; away instead of after a restart or a cache rebuild.
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
