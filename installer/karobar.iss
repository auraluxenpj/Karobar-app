; ==============================================================================
; Karobar App ERP v2.0 — Inno Setup 6 Windows (.exe) Installer Script
; ==============================================================================
; Features:
;   1. Terms & Conditions (EULA) acceptance gate
;   2. Privacy Policy & Data Ownership acceptance gate
;   3. Pre-install Hardware Machine ID display + Ed25519 License Key binding gate
;   4. Initial Administrator Account creation wizard (Name, Email, Password)
;   5. Custom installation directory picker ("Install anywhere on C:\, D:\, etc.")
;   6. Post-install database migration, role seeding, license sealing & Genie Setup flag
; ==============================================================================

#define MyAppName "Karobar App ERP"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "Malik Asim Shahzad (shzdasim)"
#define MyAppURL "https://github.com/shzdasim/Karobar-App"
#define MyAppSupportURL "https://github.com/shzdasim"
#define MyAppExeName "KarobarERP.exe"
#define BuildStageDir "..\dist\stage"

[Setup]
AppId={{8F4C92B1-5A1E-4D79-9E3B-7C21A90D4E12}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppSupportURL}
AppUpdatesURL={#MyAppURL}/releases
AppCopyright=Copyright (C) 2026 Malik Asim Shahzad (https://github.com/shzdasim)
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} — Author & Developer: Malik Asim Shahzad (https://github.com/shzdasim)
VersionInfoTextVersion={#MyAppVersion}
VersionInfoCopyright=Copyright (C) 2026 Malik Asim Shahzad (https://github.com/shzdasim)
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}.0
DefaultDirName={autopf}\Karobar ERP
DefaultGroupName={#MyAppName}
DisableDirPage=no
AllowNoIcons=yes
LicenseFile=legal\TermsAndConditions.txt
OutputDir=..\dist\installer
OutputBaseFilename=Karobar-ERP-Setup-v{#MyAppVersion}
SetupIconFile=..\desktop\icon.ico
Compression=lzma2/fast
SolidCompression=no
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\icon.ico
#ifdef SignToolEnabled
SignTool=karobarsign
SignedUninstaller=yes
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
Name: "{app}\app\database"; Permissions: users-modify
Name: "{app}\app\storage"; Permissions: users-modify
Name: "{app}\app\storage\app"; Permissions: users-modify
Name: "{app}\app\storage\app\public"; Permissions: users-modify
Name: "{app}\app\storage\app\backups"; Permissions: users-modify
Name: "{app}\app\storage\app\whatsapp-agent"; Permissions: users-modify
Name: "{app}\app\storage\framework"; Permissions: users-modify
Name: "{app}\app\storage\framework\cache"; Permissions: users-modify
Name: "{app}\app\storage\framework\sessions"; Permissions: users-modify
Name: "{app}\app\storage\framework\views"; Permissions: users-modify
Name: "{app}\app\storage\logs"; Permissions: users-modify
Name: "{app}\app\bootstrap\cache"; Permissions: users-modify

[Files]
; Lightweight pre-install PHP + libsodium + VC++ runtime + precheck.php extracted on wizard boot to compute exact Machine ID & verify Ed25519 signature BEFORE installation
Source: "{#BuildStageDir}\app\runtime\php\php.exe"; Flags: dontcopy
Source: "{#BuildStageDir}\app\runtime\php\php8.dll"; Flags: dontcopy skipifsourcedoesntexist
Source: "{#BuildStageDir}\app\runtime\php\php8ts.dll"; Flags: dontcopy skipifsourcedoesntexist
Source: "{#BuildStageDir}\app\runtime\php\vcruntime140.dll"; Flags: dontcopy skipifsourcedoesntexist
Source: "{#BuildStageDir}\app\runtime\php\vcruntime140_1.dll"; Flags: dontcopy skipifsourcedoesntexist
Source: "{#BuildStageDir}\app\runtime\php\msvcp140.dll"; Flags: dontcopy skipifsourcedoesntexist
Source: "{#BuildStageDir}\app\runtime\php\libsodium.dll"; Flags: dontcopy skipifsourcedoesntexist
Source: "{#BuildStageDir}\app\runtime\php\ext\php_sodium.dll"; Flags: dontcopy
Source: "precheck.php"; Flags: dontcopy
Source: "..\desktop\icon.ico"; DestDir: "{app}"; Flags: ignoreversion
; Full staged Electron + Laravel + PHP + Node application bundle
Source: "{#BuildStageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
; Install Developer Authenticode Certificate into local Trusted Root & Trusted Publishers store so KarobarERP.exe is trusted on this PC
Filename: "{sys}\certutil.exe"; \
  Parameters: "-addstore -f ""Root"" ""{app}\app\desktop\MalikAsimShahzad-KarobarERP.cer"""; \
  Flags: runhidden waituntilterminated; \
  Check: FileExists(ExpandConstant('{app}\app\desktop\MalikAsimShahzad-KarobarERP.cer'))

Filename: "{sys}\certutil.exe"; \
  Parameters: "-addstore -f ""TrustedPublisher"" ""{app}\app\desktop\MalikAsimShahzad-KarobarERP.cer"""; \
  Flags: runhidden waituntilterminated; \
  Check: FileExists(ExpandConstant('{app}\app\desktop\MalikAsimShahzad-KarobarERP.cer'))

; Post-Install Bootstrapper: migrates SQLite DB, creates the Admin account entered in the wizard, seals the hardware-bound license, and sets is_setup_completed=false so first login opens the Genie Setup Wizard (/setup)
Filename: "{app}\app\runtime\php\php.exe"; \
  Parameters: "artisan karobar:install --seal-file=""{tmp}\install-license.seal"" --admin-config=""{tmp}\admin-init.json"" --accept-legal --cleanup-temp"; \
  WorkingDir: "{app}\app"; \
  StatusMsg: "Initializing Karobar ERP database, administrator account, and hardware license seal..."; \
  Flags: runhidden waituntilterminated

; Launch the Desktop Application after installation completes
Filename: "{app}\{#MyAppExeName}"; \
  Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; \
  Flags: nowait postinstall skipifsilent

[Code]
var
  PrivacyPage: TWizardPage;
  PrivacyMemo: TNewMemo;
  PrivacyAcceptCheck: TNewCheckBox;

  LicenseKeyPage: TWizardPage;
  MachineIdEdit: TNewEdit;
  CopyMachineIdBtn: TNewButton;
  LicenseKeyMemo: TNewMemo;

  AdminAccountPage: TWizardPage;
  AdminNameEdit: TNewEdit;
  AdminEmailEdit: TNewEdit;
  AdminPasswordEdit: TPasswordEdit;
  AdminConfirmPasswordEdit: TPasswordEdit;

  DatabaseImportPage: TWizardPage;
  FreshDbRadio: TNewRadioButton;
  ImportDbRadio: TNewRadioButton;
  SqliteFileEdit: TNewEdit;
  BrowseSqliteBtn: TNewButton;

  DetectedMachineId: String;

{ Compute deterministic hardware Machine ID using bundled portable PHP + precheck.php }
function ComputeInstallerMachineId(): String;
var
  ResultCode: Integer;
  OutId: AnsiString;
begin
  Result := 'KRB-DETECTING';
  try
    try
      ExtractTemporaryFile('vcruntime140.dll');
    except
    end;
    try
      ExtractTemporaryFile('vcruntime140_1.dll');
    except
    end;
    try
      ExtractTemporaryFile('msvcp140.dll');
    except
    end;
    try
      ExtractTemporaryFile('libsodium.dll');
    except
    end;
    try
      ExtractTemporaryFile('php8.dll');
    except
    end;
    try
      ExtractTemporaryFile('php8ts.dll');
    except
    end;
    ExtractTemporaryFile('php.exe');
    ExtractTemporaryFile('php_sodium.dll');
    ExtractTemporaryFile('precheck.php');
    if Exec(
      ExpandConstant('{tmp}\php.exe'),
      '-n -d extension_dir="' + ExpandConstant('{tmp}') + '" -d extension=sodium "' + ExpandConstant('{tmp}\precheck.php') + '" machine-id "' + ExpandConstant('{tmp}\machine-id.txt') + '"',
      ExpandConstant('{tmp}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    ) then
    begin
      if LoadStringFromFile(ExpandConstant('{tmp}\machine-id.txt'), OutId) then
        Result := Trim(String(OutId));
    end;
  except
    Result := 'KRB-UNKNOWN-HOST';
  end;
end;

procedure OnPrivacyCheckClick(Sender: TObject);
begin
  WizardForm.NextButton.Enabled := PrivacyAcceptCheck.Checked;
end;

procedure OnCopyMachineIdClick(Sender: TObject);
begin
  WizardForm.ActiveControl := MachineIdEdit;
  MachineIdEdit.SelectAll();
  SendMessage(MachineIdEdit.Handle, $0301, 0, 0);
  MsgBox('Machine ID copied to clipboard! Send this Machine ID to Karobar Support to receive your single-machine license key.', mbInformation, MB_OK);
end;

procedure CreatePrivacyPolicyPage();
begin
  PrivacyPage := CreateCustomPage(
    wpLicense,
    'Privacy Policy & Data Ownership Agreement',
    'Please review how Karobar App ERP stores and protects your store data before continuing.'
  );

  PrivacyMemo := TNewMemo.Create(PrivacyPage);
  PrivacyMemo.Parent := PrivacyPage.Surface;
  PrivacyMemo.Left := 0;
  PrivacyMemo.Top := 0;
  PrivacyMemo.Width := PrivacyPage.SurfaceWidth;
  PrivacyMemo.Height := PrivacyPage.SurfaceHeight - ScaleY(38);
  PrivacyMemo.ScrollBars := ssVertical;
  PrivacyMemo.ReadOnly := True;
  PrivacyMemo.Text :=
    'KAROBAR APP ERP v2.0 — PRIVACY POLICY & DATA OWNERSHIP' + #13#10 + #13#10 +
    '1. 100% LOCAL-FIRST DATA OWNERSHIP' + #13#10 +
    'All business data (products, batches, invoices, ledgers, accounts, and HR records) is stored locally on your computer inside your chosen installation directory. We do not collect, upload, or sell your store records to any external server.' + #13#10 + #13#10 +
    '2. HARDWARE IDENTIFICATION FOR SINGLE-MACHINE LICENSING' + #13#10 +
    'To permanently bind your software license to this machine, the Software computes a one-way cryptographic hash (KRB-XXXX-XXXX-XXXX-XXXX) from your OS and hardware identifiers.' + #13#10 + #13#10 +
    '3. OPTIONAL INTEGRATIONS (WHATSAPP, SMTP EMAIL & CUBE AI)' + #13#10 +
    'Outbound messages via the built-in Local WhatsApp Agent, SMTP Email, or Cube AI Co-Pilot only occur when explicitly enabled by the Store Administrator in Settings.' + #13#10 + #13#10 +
    '4. LOCAL SECURITY & ACCESS CONTROL' + #13#10 +
    'Administrator credentials created in the next step are hashed locally using bcrypt.';

  PrivacyAcceptCheck := TNewCheckBox.Create(PrivacyPage);
  PrivacyAcceptCheck.Parent := PrivacyPage.Surface;
  PrivacyAcceptCheck.Left := 0;
  PrivacyAcceptCheck.Top := PrivacyMemo.Top + PrivacyMemo.Height + ScaleY(10);
  PrivacyAcceptCheck.Width := PrivacyPage.SurfaceWidth;
  PrivacyAcceptCheck.Caption := 'I have read and agree to the Karobar App ERP Privacy Policy';
  PrivacyAcceptCheck.Checked := False;
  PrivacyAcceptCheck.OnClick := @OnPrivacyCheckClick;
end;

procedure CreateLicenseBindingPage();
var
  MachineIdLabel, KeyLabel: TNewStaticText;
begin
  LicenseKeyPage := CreateCustomPage(
    PrivacyPage.ID,
    'Software License Key & Machine Binding',
    'Enter your Karobar license key. This key will permanently bind to this computer and can never be used on another machine.'
  );

  MachineIdLabel := TNewStaticText.Create(LicenseKeyPage);
  MachineIdLabel.Parent := LicenseKeyPage.Surface;
  MachineIdLabel.Left := 0;
  MachineIdLabel.Top := 0;
  MachineIdLabel.Caption := 'Your Computer''s Hardware Machine ID (Send this to receive your bound key):';

  MachineIdEdit := TNewEdit.Create(LicenseKeyPage);
  MachineIdEdit.Parent := LicenseKeyPage.Surface;
  MachineIdEdit.Left := 0;
  MachineIdEdit.Top := MachineIdLabel.Top + ScaleY(20);
  MachineIdEdit.Width := LicenseKeyPage.SurfaceWidth - ScaleX(130);
  MachineIdEdit.ReadOnly := True;
  MachineIdEdit.Text := DetectedMachineId;

  CopyMachineIdBtn := TNewButton.Create(LicenseKeyPage);
  CopyMachineIdBtn.Parent := LicenseKeyPage.Surface;
  CopyMachineIdBtn.Left := MachineIdEdit.Width + ScaleX(8);
  CopyMachineIdBtn.Top := MachineIdEdit.Top - ScaleY(1);
  CopyMachineIdBtn.Width := ScaleX(122);
  CopyMachineIdBtn.Height := MachineIdEdit.Height + ScaleY(2);
  CopyMachineIdBtn.Caption := 'Copy Machine ID';
  CopyMachineIdBtn.OnClick := @OnCopyMachineIdClick;

  KeyLabel := TNewStaticText.Create(LicenseKeyPage);
  KeyLabel.Parent := LicenseKeyPage.Surface;
  KeyLabel.Left := 0;
  KeyLabel.Top := MachineIdEdit.Top + ScaleY(36);
  KeyLabel.Caption := 'Paste your Machine-Bound License Key (KRBL....):';

  LicenseKeyMemo := TNewMemo.Create(LicenseKeyPage);
  LicenseKeyMemo.Parent := LicenseKeyPage.Surface;
  LicenseKeyMemo.Left := 0;
  LicenseKeyMemo.Top := KeyLabel.Top + ScaleY(20);
  LicenseKeyMemo.Width := LicenseKeyPage.SurfaceWidth;
  LicenseKeyMemo.Height := LicenseKeyPage.SurfaceHeight - LicenseKeyMemo.Top - ScaleY(4);
  LicenseKeyMemo.ScrollBars := ssVertical;
end;

procedure CreateAdminAccountPage();
var
  NameLbl, EmailLbl, PassLbl, ConfirmLbl: TNewStaticText;
begin
  AdminAccountPage := CreateCustomPage(
    LicenseKeyPage.ID,
    'Create Store Administrator Account',
    'Set up your primary Administrator login credentials. You will use these to sign in on first launch and open the Setup Genie.'
  );

  NameLbl := TNewStaticText.Create(AdminAccountPage);
  NameLbl.Parent := AdminAccountPage.Surface;
  NameLbl.Left := 0;
  NameLbl.Top := 0;
  NameLbl.Caption := 'Administrator Full Name:';

  AdminNameEdit := TNewEdit.Create(AdminAccountPage);
  AdminNameEdit.Parent := AdminAccountPage.Surface;
  AdminNameEdit.Left := 0;
  AdminNameEdit.Top := NameLbl.Top + ScaleY(18);
  AdminNameEdit.Width := AdminAccountPage.SurfaceWidth;
  AdminNameEdit.Text := 'Store Administrator';

  EmailLbl := TNewStaticText.Create(AdminAccountPage);
  EmailLbl.Parent := AdminAccountPage.Surface;
  EmailLbl.Left := 0;
  EmailLbl.Top := AdminNameEdit.Top + ScaleY(34);
  EmailLbl.Caption := 'Administrator Email Address (Used to Sign In):';

  AdminEmailEdit := TNewEdit.Create(AdminAccountPage);
  AdminEmailEdit.Parent := AdminAccountPage.Surface;
  AdminEmailEdit.Left := 0;
  AdminEmailEdit.Top := EmailLbl.Top + ScaleY(18);
  AdminEmailEdit.Width := AdminAccountPage.SurfaceWidth;
  AdminEmailEdit.Text := 'admin@karobar.local';

  PassLbl := TNewStaticText.Create(AdminAccountPage);
  PassLbl.Parent := AdminAccountPage.Surface;
  PassLbl.Left := 0;
  PassLbl.Top := AdminEmailEdit.Top + ScaleY(34);
  PassLbl.Caption := 'Administrator Password (Minimum 6 characters):';

  AdminPasswordEdit := TPasswordEdit.Create(AdminAccountPage);
  AdminPasswordEdit.Parent := AdminAccountPage.Surface;
  AdminPasswordEdit.Left := 0;
  AdminPasswordEdit.Top := PassLbl.Top + ScaleY(18);
  AdminPasswordEdit.Width := AdminAccountPage.SurfaceWidth;

  ConfirmLbl := TNewStaticText.Create(AdminAccountPage);
  ConfirmLbl.Parent := AdminAccountPage.Surface;
  ConfirmLbl.Left := 0;
  ConfirmLbl.Top := AdminPasswordEdit.Top + ScaleY(34);
  ConfirmLbl.Caption := 'Confirm Administrator Password:';

  AdminConfirmPasswordEdit := TPasswordEdit.Create(AdminAccountPage);
  AdminConfirmPasswordEdit.Parent := AdminAccountPage.Surface;
  AdminConfirmPasswordEdit.Left := 0;
  AdminConfirmPasswordEdit.Top := ConfirmLbl.Top + ScaleY(18);
  AdminConfirmPasswordEdit.Width := AdminAccountPage.SurfaceWidth;
end;

procedure OnDbModeChange(Sender: TObject);
begin
  SqliteFileEdit.Enabled := ImportDbRadio.Checked;
  BrowseSqliteBtn.Enabled := ImportDbRadio.Checked;
end;

procedure OnBrowseSqliteClick(Sender: TObject);
var
  SelectedFile: String;
begin
  SelectedFile := SqliteFileEdit.Text;
  if GetOpenFileName(
    'Select Existing Herd / Karobar SQLite Database File',
    SelectedFile,
    '',
    'SQLite Database Files (*.sqlite;*.db;*.sqlite3)|*.sqlite;*.db;*.sqlite3|All Files (*.*)|*.*',
    'sqlite'
  ) then
  begin
    SqliteFileEdit.Text := SelectedFile;
    ImportDbRadio.Checked := True;
    OnDbModeChange(Sender);
  end;
end;

procedure CreateDatabaseImportPage();
var
  InfoLabel, FileLabel: TNewStaticText;
begin
  DatabaseImportPage := CreateCustomPage(
    AdminAccountPage.ID,
    'Database Setup & Herd SQLite Import (Optional)',
    'Choose whether to start with a fresh database or import an existing SQLite database from Laravel Herd.'
  );

  FreshDbRadio := TNewRadioButton.Create(DatabaseImportPage);
  FreshDbRadio.Parent := DatabaseImportPage.Surface;
  FreshDbRadio.Left := 0;
  FreshDbRadio.Top := ScaleY(4);
  FreshDbRadio.Width := DatabaseImportPage.SurfaceWidth;
  FreshDbRadio.Caption := 'Start with a Fresh Database (New Store Installation)';
  FreshDbRadio.Checked := True;
  FreshDbRadio.OnClick := @OnDbModeChange;

  ImportDbRadio := TNewRadioButton.Create(DatabaseImportPage);
  ImportDbRadio.Parent := DatabaseImportPage.Surface;
  ImportDbRadio.Left := 0;
  ImportDbRadio.Top := FreshDbRadio.Top + ScaleY(28);
  ImportDbRadio.Width := DatabaseImportPage.SurfaceWidth;
  ImportDbRadio.Caption := 'Import Existing SQLite Database (From Herd / Existing Karobar Deployment)';
  ImportDbRadio.Checked := False;
  ImportDbRadio.OnClick := @OnDbModeChange;

  InfoLabel := TNewStaticText.Create(DatabaseImportPage);
  InfoLabel.Parent := DatabaseImportPage.Surface;
  InfoLabel.Left := ScaleX(18);
  InfoLabel.Top := ImportDbRadio.Top + ScaleY(24);
  InfoLabel.Width := DatabaseImportPage.SurfaceWidth - ScaleX(18);
  InfoLabel.AutoSize := False;
  InfoLabel.WordWrap := True;
  InfoLabel.Height := ScaleY(52);
  InfoLabel.Caption :=
    'All Products, Batches, Categories, Brands, Suppliers, Customers, Invoices, Returns, Ledgers, and Accounts will be kept 100% intact. ' +
    'Only old Users and old License records will be cleared and replaced with the Administrator account and License Key entered in this wizard.';

  FileLabel := TNewStaticText.Create(DatabaseImportPage);
  FileLabel.Parent := DatabaseImportPage.Surface;
  FileLabel.Left := 0;
  FileLabel.Top := InfoLabel.Top + ScaleY(60);
  FileLabel.Caption := 'Select Existing SQLite Database File (e.g. database.sqlite):';

  SqliteFileEdit := TNewEdit.Create(DatabaseImportPage);
  SqliteFileEdit.Parent := DatabaseImportPage.Surface;
  SqliteFileEdit.Left := 0;
  SqliteFileEdit.Top := FileLabel.Top + ScaleY(20);
  SqliteFileEdit.Width := DatabaseImportPage.SurfaceWidth - ScaleX(100);
  SqliteFileEdit.Enabled := False;

  BrowseSqliteBtn := TNewButton.Create(DatabaseImportPage);
  BrowseSqliteBtn.Parent := DatabaseImportPage.Surface;
  BrowseSqliteBtn.Left := SqliteFileEdit.Width + ScaleX(8);
  BrowseSqliteBtn.Top := SqliteFileEdit.Top - ScaleY(1);
  BrowseSqliteBtn.Width := ScaleX(92);
  BrowseSqliteBtn.Height := SqliteFileEdit.Height + ScaleY(2);
  BrowseSqliteBtn.Caption := 'Browse...';
  BrowseSqliteBtn.Enabled := False;
  BrowseSqliteBtn.OnClick := @OnBrowseSqliteClick;
end;

function EscapeJsonString(const S: String): String;
var
  R: String;
begin
  R := S;
  StringChangeEx(R, '\', '\\', True);
  StringChangeEx(R, '"', '\"', True);
  Result := R;
end;

procedure InitializeWizard();
begin
  DetectedMachineId := ComputeInstallerMachineId();
  CreatePrivacyPolicyPage();
  CreateLicenseBindingPage();
  CreateAdminAccountPage();
  CreateDatabaseImportPage();
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = PrivacyPage.ID then
  begin
    WizardForm.NextButton.Enabled := PrivacyAcceptCheck.Checked;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  KeyText, AdminJson, ImportPath: String;
  VerifyResultCode: Integer;
  ErrorMsgAnsi: AnsiString;
begin
  Result := True;

  { 1. Enforce Privacy Policy Acceptance }
  if CurPageID = PrivacyPage.ID then
  begin
    if not PrivacyAcceptCheck.Checked then
    begin
      MsgBox('You must read and accept the Privacy Policy before continuing.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  { 2. Enforce Cryptographic Ed25519 License Key & Single-Machine Binding Gate }
  if CurPageID = LicenseKeyPage.ID then
  begin
    KeyText := Trim(LicenseKeyMemo.Text);
    if (Length(KeyText) < 24) or (Pos('.', KeyText) = 0) then
    begin
      MsgBox('Please paste a valid Karobar machine-bound license key (KRBL....) to bind this installation to your computer.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    SaveStringToFile(ExpandConstant('{tmp}\input-key.txt'), KeyText, False);

    if not Exec(
      ExpandConstant('{tmp}\php.exe'),
      '-n -d extension_dir="' + ExpandConstant('{tmp}') + '" -d extension=sodium "' + ExpandConstant('{tmp}\precheck.php') + '" verify "' + ExpandConstant('{tmp}\input-key.txt') + '" "' + ExpandConstant('{tmp}\install-license.seal') + '" "' + ExpandConstant('{tmp}\license-error.txt') + '"',
      ExpandConstant('{tmp}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      VerifyResultCode
    ) or (VerifyResultCode <> 0) then
    begin
      if LoadStringFromFile(ExpandConstant('{tmp}\license-error.txt'), ErrorMsgAnsi) then
        MsgBox(Trim(String(ErrorMsgAnsi)), mbError, MB_OK)
      else
        MsgBox('License key verification failed. Ensure this key is valid and bound to Machine ID: ' + DetectedMachineId, mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  { 3. Enforce Initial Administrator Credentials Gate }
  if CurPageID = AdminAccountPage.ID then
  begin
    if Trim(AdminNameEdit.Text) = '' then
    begin
      MsgBox('Please enter the Administrator Full Name.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if (Pos('@', AdminEmailEdit.Text) = 0) or (Pos('.', AdminEmailEdit.Text) = 0) then
    begin
      MsgBox('Please enter a valid Administrator Email Address (e.g. admin@mystore.com).', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if Length(AdminPasswordEdit.Text) < 6 then
    begin
      MsgBox('Administrator password must be at least 6 characters long.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if AdminPasswordEdit.Text <> AdminConfirmPasswordEdit.Text then
    begin
      MsgBox('The password and confirmation password do not match.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    AdminJson :=
      '{"name":"' + EscapeJsonString(Trim(AdminNameEdit.Text)) +
      '","email":"' + EscapeJsonString(Trim(AdminEmailEdit.Text)) +
      '","password":"' + EscapeJsonString(AdminPasswordEdit.Text) +
      '","import_sqlite":""}';

    SaveStringToFile(ExpandConstant('{tmp}\admin-init.json'), AdminJson, False);
  end;

  { 4. Enforce Optional SQLite Database Import Selection }
  if CurPageID = DatabaseImportPage.ID then
  begin
    ImportPath := '';
    if ImportDbRadio.Checked then
    begin
      ImportPath := Trim(SqliteFileEdit.Text);
      if (ImportPath = '') or (not FileExists(ImportPath)) then
      begin
        MsgBox('Please select a valid existing SQLite database file (.sqlite / .db) to import, or choose "Start with a Fresh Database".', mbError, MB_OK);
        Result := False;
        Exit;
      end;
    end;

    AdminJson :=
      '{"name":"' + EscapeJsonString(Trim(AdminNameEdit.Text)) +
      '","email":"' + EscapeJsonString(Trim(AdminEmailEdit.Text)) +
      '","password":"' + EscapeJsonString(AdminPasswordEdit.Text) +
      '","import_sqlite":"' + EscapeJsonString(ImportPath) + '"}';

    SaveStringToFile(ExpandConstant('{tmp}\admin-init.json'), AdminJson, False);
  end;
end;
