// Builds the Keycloak user guide. Usage: node gen_keycloak.js <output.docx>
// The screenshots in screenshots/ were taken from the local development setup.
const fs = require('fs');
const path = require('path');
const {
  d, FONT, BLUE, p, h, borders, cell, buildDocument, write,
} = require('./lib');
const {
  HeadingLevel, Table, TableRow, WidthType, TableOfContents, ImageRun, Paragraph, TextRun,
  AlignmentType, PageBreak, ShadingType, TableLayoutType,
} = d;

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node gen_keycloak.js <output.docx>'); process.exit(1); }

const children = [];
const add = (...x) => children.push(...x);
// headings stay with the paragraph that follows them
const H1 = (t, o = {}) => add(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, ...o, children: [new TextRun(t)] }));
const H2 = t => add(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(t)] }));
const para = (t, o = {}) => add(p(t, o));
const runs = parts => (Array.isArray(parts) ? parts : [parts]).map(x => new TextRun(typeof x === 'string' ? { text: x } : x));
const b = text => ({ text, bold: true });
const mono = text => ({ text, font: 'Consolas', size: 20 });
const rich = parts => add(new Paragraph({ spacing: { after: 120 }, children: runs(parts) }));
const bullet = parts => add(new Paragraph({ bullet: { level: 0 }, spacing: { after: 70 }, children: runs(parts) }));
const step = (n, parts) => add(new Paragraph({ spacing: { after: 90 }, indent: { left: 360, hanging: 360 }, children: [new TextRun({ text: n + '.\t', bold: true, color: BLUE }), ...runs(parts)], tabStops: [{ type: d.TabStopType.LEFT, position: 360 }] }));
const note = (label, text) => add(new Paragraph({
  spacing: { before: 80, after: 160 }, indent: { left: 120, right: 120 },
  shading: { type: ShadingType.CLEAR, fill: 'EEF3FA', color: 'auto' },
  children: [new TextRun({ text: label + ' ', bold: true, color: BLUE }), new TextRun(text)],
}));

function code(text, label) {
  const lines = text.replace(/\n$/, '').split('\n');
  if (label) add(new Paragraph({ keepNext: true, spacing: { before: 80, after: 40 }, children: [new TextRun({ text: label, bold: true, size: 20 })] }));
  lines.forEach((l, i) => add(new Paragraph({
    keepNext: i < lines.length - 1, keepLines: true,
    spacing: { after: i === lines.length - 1 ? 160 : 0, line: 252 },
    shading: { type: ShadingType.CLEAR, fill: 'F1F4F8', color: 'auto' },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text: l === '' ? ' ' : l, font: 'Consolas', size: 18 })],
  })));
}

function grid(widths, head, rows, o = {}) {
  const total = widths.reduce((a, c) => a + c, 0);
  const mk = (r, header) => new TableRow({
    tableHeader: header, cantSplit: true,
    children: r.map((t, c) => cell(t, widths[c], header
      ? { bold: true, fill: BLUE, color: 'FFFFFF', keepNext: true }
      : { mono: (o.mono || []).includes(c) })),
  });
  add(new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [mk(head, true), ...rows.map(r => mk(r, false))],
  }));
  add(new Paragraph({ spacing: { after: 160 }, children: [] }));
}

// A screenshot with a caption, scaled to fit the page width.
function shot(file, caption, maxW = 520) {
  const buf = fs.readFileSync(path.join(__dirname, 'screenshots', file));
  const w = buf.readUInt32BE(16), hgt = buf.readUInt32BE(20);
  const width = Math.min(maxW, w), height = Math.round(width * hgt / w);
  add(new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 40 },
    children: [new ImageRun({ type: 'png', data: buf, transformation: { width, height }, altText: { title: caption, description: caption, name: file } })],
  }));
  add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: caption, italics: true, size: 18, color: '555555' })] }));
}

// ---------- front matter ----------
add(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: 'Magic Lantern Workbench Platform', size: 28, color: '666666' })] }));
add(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Keycloak and Login')] }));
add(p(`User guide  ·  Generated ${new Date().toISOString().slice(0, 10)}`, { run: { color: '666666' } }));
add(p('This guide shows how to use the Keycloak server that comes with the MLW Docker Compose files: how to start it, how people sign in to the MLW application with it, and how an administrator adds users and controls who may sign in. The application login is used as the example throughout.'));
add(new Paragraph({ spacing: { before: 480, after: 120 }, children: [new TextRun({ text: 'Contents', bold: true, size: 32, color: BLUE })] }));
add(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }));

// ---------- 1 ----------
H1('1. What Keycloak Does for MLW', { pageBreakBefore: true });
para('Keycloak is the login service. People do not sign in to the MLW application itself: the application sends them to Keycloak, they enter their user name and password there, and Keycloak sends them back signed in. The application never sees the password.');
para('This means that user accounts, passwords and who may sign in are managed in Keycloak, in one place, and not in the MLW database.');
para('Keycloak keeps its accounts in realms, which are separate groups of users. Two realms matter here:');
bullet([b('mlw'), ' holds the people who use the MLW application. The application and this guide’s sign-in examples use this realm.']);
bullet([b('master'), ' holds the Keycloak administrators, who manage realms and users in the admin console.']);
para('Local development comes with accounts ready to use:');
grid([2300, 2300, 2300, 2460], ['Account', 'User name', 'Password', 'Use it to'], [
  ['Application user', 'mlw', 'mlw', 'Sign in to the application'],
  ['Keycloak administrator', 'admin', 'admin', 'Open the admin console and manage users'],
]);
note('Note:', 'These accounts exist only in local development. A production server has no application users, and the administrator’s name and password come from your .env file (section 2.2).');
grid([2300, 4000, 3060], ['Address', 'What it is', 'Production'], [
  ['http://localhost:8090', 'The MLW application (web user interface and REST API)', 'APP_PUBLIC_URL'],
  ['http://localhost:8180', 'Keycloak. The admin console is at /admin', 'KEYCLOAK_HOSTNAME'],
]);

// ---------- 2 ----------
H1('2. Starting and Stopping Keycloak');
H2('2.1 Local development');
para('Keycloak is the keycloak service in the Compose files. It starts together with the application:');
code('docker compose up -d --build', 'Start everything');
para('The first start takes about half a minute while Keycloak creates the realm. When http://localhost:8180/realms/mlw answers, Keycloak is ready, and the application is at http://localhost:8090.');
code('docker compose stop keycloak     # stop only Keycloak\ndocker compose up -d keycloak     # start it again\ndocker compose down               # stop everything, keep the data\ndocker compose down -v            # stop everything and delete all data', 'Stop and restart');
para('Keycloak keeps its users and settings in the Docker volume keycloak_data, so they survive a restart. Only down -v deletes them, and the next start then creates the realm again from the files in docker/keycloak.');
note('Note:', 'The realm is created from docker/keycloak/mlw-realm-dev.json only when it does not exist yet. If you edit that file, run docker compose down -v to start again with the new contents. Changes made in the admin console are kept in the volume.');

H2('2.2 A server (production)');
para('On a server use the production override file. It runs Keycloak in production mode with its own PostgreSQL database (the keycloak-db service) and keeps it running after a reboot:');
code('docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d');
para('These settings must be set in the .env file, or Compose refuses to start:');
grid([2800, 6560], ['Setting', 'Meaning'], [
  ['KEYCLOAK_ADMIN', 'User name of the first administrator.'],
  ['KEYCLOAK_ADMIN_PASSWORD', 'Password of the first administrator.'],
  ['KEYCLOAK_DB_PASSWORD', 'Password of the Keycloak database.'],
  ['KEYCLOAK_HOSTNAME', 'The public address of Keycloak, for example https://id.example.org.'],
  ['APP_PUBLIC_URL', 'The address people open the application at, for example https://mlw.example.org. Keycloak only sends people back to this address.'],
], { mono: [0] });
para('Keycloak serves plain HTTP on port 8180 of the server (only to the server itself by default). Put a reverse proxy that handles HTTPS in front of it, and send it the usual X-Forwarded headers. People should only reach Keycloak through that HTTPS address.');
para('The production realm has no users. Sign in to the admin console with KEYCLOAK_ADMIN and create the people who should use the application (section 4).');

// ---------- 3 ----------
H1('3. Signing In to the Application');
para('This section is for everyone who uses the application. The screenshots show a user named ann, whom an administrator creates in section 4. In local development you can follow along with the ready-made user mlw (password mlw); on a server use your own account.');
H2('3.1 Sign in');
step(1, ['Open the application, http://localhost:8090. The login page asks you to sign in.']);
shot('app-login.png', 'The application’s login page');
step(2, ['Click ', b('Sign in with Keycloak'), '. Your browser goes to the Keycloak sign-in page.']);
step(3, ['Enter your user name (or email) and password, and click ', b('Sign In'), '.']);
shot('keycloak-login.png', 'The Keycloak sign-in page of the mlw realm');
step(4, ['Keycloak sends you back to the application, which shows the tables. Your name and a ', b('Sign out'), ' button are at the top left. If you had opened the application at a particular table (for example http://localhost:8090/#shot), you land on that table.']);
shot('app-signed-in.png', 'The application after signing in as ann');
para('If the user name or password is wrong, Keycloak shows an error and you can try again:');
shot('keycloak-wrong-password.png', 'A wrong password');

H2('3.2 Your first sign-in with a temporary password');
para('An administrator can give you a temporary password. The first time you use it, Keycloak asks you to choose your own password before you continue. Enter the new password twice and submit; you are then signed in.');
shot('keycloak-update-password.png', 'Choosing a new password after signing in with a temporary one');

H2('3.3 How long you stay signed in');
bullet(['Reloading the page keeps you signed in. Closing the browser tab does not: open the application again and sign in again.']);
bullet(['The application renews your login in the background while you work, so you are not asked again every few minutes.']);
bullet(['If your login can no longer be renewed (for example you were idle for 30 minutes, or an administrator disabled your account), the login page comes back. Click ', b('Sign in with Keycloak'), ' again.']);

H2('3.4 Sign out');
para('Click Sign out at the top left. You return to the login page, and your session at Keycloak ends too, so the next sign-in asks for your password again. This matters on a shared computer.');

// ---------- 4 ----------
H1('4. Managing Users (Administrators)');
para('Users are added, changed and removed in the Keycloak admin console. The steps below create a user named ann who may use the application.');
H2('4.1 Open the admin console');
step(1, ['Open http://localhost:8180/admin (on a server, your KEYCLOAK_HOSTNAME followed by /admin).']);
step(2, ['Sign in as the administrator (admin / admin in local development).']);
step(3, ['The console shows the master realm. Open ', b('Manage realms'), ' in the left menu and click ', b('mlw'), '. The left menu now shows “Magic Lantern Workbench” as the current realm.']);
shot('admin-realms.png', 'Manage realms: choose mlw, the realm of the application’s users', 460);
note('Important:', 'Always check that the current realm is mlw before you add users. Users added to the master realm are Keycloak accounts, not application users, and cannot sign in to the application.');
para('A yellow banner may warn that you are using a temporary admin user. See section 7 to replace it.');

H2('4.2 Add a user');
step(1, ['Choose ', b('Users'), ' in the left menu. The list shows the existing users.']);
shot('admin-users.png', 'The users of the mlw realm', 460);
step(2, ['Click ', b('Add user'), '. Enter a ', b('Username'), ' (required). The email, first name and last name are optional but make the list easier to read. Switch ', b('Email verified'), ' on if you know the address is right.']);
step(3, ['Click ', b('Create'), '.']);
shot('admin-add-user.png', 'Adding the user ann', 460);

H2('4.3 Set the password');
step(1, ['On the new user, open the ', b('Credentials'), ' tab and click ', b('Set password'), '.']);
step(2, ['Enter the password twice. Leave ', b('Temporary'), ' on if the person should choose their own password at the first sign-in (section 3.2), or switch it off to set the password for good.']);
shot('admin-set-password.png', 'Setting a password', 460);
step(3, ['Click ', b('Save'), ', then ', b('Save password'), ' to confirm.']);
para('Once a user has a password, the same tab shows the credential and a Reset password button. Use it to give a person who forgot their password a new one. The “Forgot Password?” link on the sign-in page needs email to be set up in Keycloak, which it is not by default, so people should ask an administrator.');
shot('admin-credentials.png', 'The Credentials tab of a user with a password', 460);

H2('4.4 Give the user the mlw-user role');
para('The role mlw-user means “may use the MLW application”. Whether the application checks it depends on a setting (section 5), but it is good practice to give it to every application user.');
step(1, ['Open the ', b('Role mapping'), ' tab of the user and click ', b('Assign role'), ', then ', b('Realm roles'), '.']);
step(2, ['Tick ', b('mlw-user'), ' and click ', b('Assign'), '.']);
shot('admin-assign-role.png', 'Assigning the realm role mlw-user', 460);
shot('admin-role-assigned.png', 'mlw-user is now one of the user’s roles', 460);

H2('4.5 Disable or delete a user');
bullet(['To stop someone signing in without losing their account, open the user and switch ', b('Enabled'), ' off at the top of the page. They are signed out of the application once their current access ends (within a few minutes).']);
bullet(['To remove the account, choose ', b('Users'), ', tick the user and click ', b('Delete user'), '.']);

// ---------- 5 ----------
H1('5. Controlling Who May Use the Application');
para('By default every user of the mlw realm may use the application. To allow only users who have the role mlw-user, set OIDC_REQUIRED_ROLE in the .env file and restart the application:');
code('# .env\nOIDC_REQUIRED_ROLE=mlw-user', 'Require the role');
code('docker compose up -d app', 'Restart the application');
para('A user without the role can still sign in at Keycloak, because the account is valid, but the application refuses every request. The person lands on the login page again, with the message “Your session has ended. Sign in again.” Signing in again does not help. The fix is to give the user the role (section 4.4).');
shot('app-no-role.png', 'A user without the required role is sent back to the login page');
para('Leave OIDC_REQUIRED_ROLE empty to allow everyone in the realm.');

// ---------- 6 ----------
H1('6. Using the API with a Login');
para('Programs and scripts call the REST API with an access token from Keycloak, sent as a bearer token. Ask Keycloak for one with a user name and password (in local development, the user mlw):');
code(`TOKEN=$(curl -s http://localhost:8180/realms/mlw/protocol/openid-connect/token \\
  -d client_id=mlw-app -d username=mlw -d password=mlw -d grant_type=password \\
  | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8090/api/v1/tables`, 'Get a token and use it');
bullet(['An access token is valid for 5 minutes. Ask for a new one when a request returns 401.']);
bullet(['Requesting a token with a password is only enabled in local development, to make testing easy. On a server, people use the web interface; for scripts use the API token (API_TOKEN), which the application still accepts: ', mono('curl -H "Authorization: Bearer <API_TOKEN>" …')]);
bullet(['The API documentation page in the application (“Try it out”) uses your login automatically.']);
para('The API itself is described in MLW_REST_API.docx.');

// ---------- 7 ----------
H1('7. Securing the Administrator Account');
para('Keycloak warns that the first administrator is temporary: it is created from KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD only the first time Keycloak starts. On a server:');
step(1, ['Sign in to the admin console and choose the ', b('master'), ' realm (Manage realms, then master).']);
step(2, ['Add a user for yourself as in section 4.2 and set a strong password (section 4.3).']);
step(3, ['On the ', b('Role mapping'), ' tab, assign the realm role ', b('admin'), '.']);
step(4, ['Sign out, sign in as the new user, and delete the temporary admin user.']);
para('Never use the local development passwords (admin / admin, mlw / mlw) on a server.');

// ---------- 8 ----------
H1('8. Settings');
para('The settings below go in the .env file next to the Compose files (see .env.example). Compose reads it when it starts the services.');
grid([3300, 2200, 3860], ['Setting', 'Default', 'Meaning'], [
  ['KEYCLOAK_VERSION', '26.4.0', 'Version of the Keycloak image.'],
  ['KEYCLOAK_PORT, KEYCLOAK_BIND', '8180, 127.0.0.1', 'Port and interface Keycloak is published on. The application follows KEYCLOAK_PORT in local development.'],
  ['KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD', 'admin, admin (local only)', 'The first administrator. Required in production.'],
  ['KEYCLOAK_HOSTNAME', '(none)', 'Public address of Keycloak. Required in production.'],
  ['KEYCLOAK_DB_PASSWORD', '(none)', 'Password of the Keycloak database. Required in production.'],
  ['APP_PUBLIC_URL', '(none)', 'Address people open the application at. Required in production.'],
  ['OIDC_REQUIRED_ROLE', '(none)', 'Realm role a user needs to use the application. Empty allows every user of the realm.'],
  ['OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_JWKS_URL', 'set by the Compose files', 'Only needed to use another Keycloak than the one in the Compose files.'],
], { mono: [0] });

// ---------- 9 ----------
H1('9. Troubleshooting');
grid([2700, 3300, 3360], ['What you see', 'Likely cause', 'What to do'], [
  ['The application opens without a login page and shows the tables', 'Login is not configured: OIDC_ISSUER is not set, for example when only the app service was started from the base Compose file.', 'Start the application with the override or production file, or set OIDC_ISSUER in .env.'],
  ['The login page appears but the Keycloak page says the address cannot be reached, or the realm is not found', 'Keycloak is still starting, or the realm was not created.', 'Wait until http://localhost:8180/realms/mlw answers. If it never does, check docker compose logs keycloak.'],
  ['Keycloak says “Invalid parameter: redirect_uri”', 'The application was opened at an address Keycloak does not know. Local development accepts http(s)://localhost:8090 only.', 'Open http://localhost:8090. To use another address, add it under Clients, mlw-app, Valid redirect URIs and Web origins, and Valid post logout redirect URIs.'],
  ['“Invalid username or password”', 'Wrong password, or the account is disabled.', 'Check the user in the admin console; reset the password (section 4.3) or switch Enabled on.'],
  ['“Your session has ended. Sign in again.” right after signing in', 'The user does not have the role required by OIDC_REQUIRED_ROLE, or the application cannot reach Keycloak to check the login.', 'Give the user mlw-user (section 4.4). If other users work, that is the cause; if nobody can sign in, check docker compose logs app.'],
  ['“Your session has ended” after working for a while', 'The login could not be renewed, for example after 30 idle minutes.', 'Sign in again.'],
  ['curl returns 401 with a token', 'The token expired (5 minutes), or it was issued by another realm or client.', 'Request a new token from the mlw realm with client_id=mlw-app.'],
  ['The realm file was changed but nothing happened', 'The realm is only created when it does not exist.', 'Use docker compose down -v to delete the data and start again, or change the setting in the admin console.'],
  ['The admin console says you are using a temporary admin user', 'The first administrator is temporary.', 'See section 7.'],
]);

const doc = buildDocument('MLW Keycloak and Login', 'MLW Keycloak and Login', children);
write(doc, OUT);
