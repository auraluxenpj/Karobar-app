<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $title }} — Karobar App ERP</title>
    <style>
        :root {
            --bg: #f8fafc;
            --card: #ffffff;
            --text: #0f172a;
            --muted: #475569;
            --border: #e2e8f0;
            --accent: #2563eb;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.65;
            padding: 32px 16px;
        }
        .container {
            max-width: 840px;
            margin: 0 auto;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 36px 40px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }
        .badge {
            display: inline-block;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--accent);
            background: #eff6ff;
            padding: 4px 10px;
            border-radius: 999px;
            margin-bottom: 12px;
        }
        h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.02em; }
        .meta { font-size: 13px; color: var(--muted); margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
        h2 { font-size: 18px; margin-top: 26px; margin-bottom: 8px; color: #1e293b; }
        p, li { font-size: 14.5px; color: #334155; }
        ul { padding-left: 20px; }
        .nav-links { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); display: flex; gap: 16px; font-size: 13.5px; }
        .nav-links a { color: var(--accent); text-decoration: none; font-weight: 500; }
        .nav-links a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <span class="badge">Karobar App ERP v2.0 — Legal Agreement</span>
        <h1>{{ $title }}</h1>
        <div class="meta">Effective Version: 2.0 &bull; Applies to On-Premise &amp; Web Installations</div>

        @if($type === 'terms')
            <h2>1. Single-Machine License Grant &amp; Hardware Binding</h2>
            <p>Karobar App ERP ("the Software") is licensed, not sold. Each license key (<code>KRBL.</code> cryptographic certificate) is permanently bound to the unique hardware fingerprint (<strong>Machine ID</strong>) of the single computer or server on which it is activated. A license key bound to one machine cannot be transferred, cloned, or reused on any other computer.</p>

            <h2>2. Anti-Tampering &amp; System Clock Integrity</h2>
            <p>The Software employs Ed25519 digital signatures, hardware-sealed database records, and monotonic clock verification. Attempting to bypass license enforcement, modify application binaries or scripts, clone the SQLite database to an unlicensed machine, or roll back the system clock will automatically revoke the active license session.</p>

            <h2>3. Permitted Commercial Use</h2>
            <p>You may install and operate the Software in any directory or drive on the licensed computer to manage retail, wholesale, pharmacy, inventory, accounting, and HR operations for your business.</p>

            <h2>4. Backups &amp; Data Responsibility</h2>
            <p>Because Karobar App ERP operates as a local-first on-premise desktop application, all business records reside on your local storage drive. You are responsible for maintaining regular backups (using the built-in Automated Backup &amp; Off-Server Storage system) to an external drive or secondary partition.</p>

            <h2>5. Limitation of Liability</h2>
            <p>The Software is provided "as is" without warranties of any kind. In no event shall the publisher or its licensors be liable for indirect, incidental, or consequential damages arising from hardware failure, tax configuration errors, or third-party integrations.</p>
        @else
            <h2>1. Local-First Data Ownership (100% On-Premise Storage)</h2>
            <p>Karobar App ERP stores your products, batches, invoices, customer ledgers, financial accounts, and employee payroll records locally inside your computer's SQLite database. We do not collect, upload, or sell your store's commercial or financial data to any external cloud server.</p>

            <h2>2. Hardware Identification for License Verification</h2>
            <p>To enforce single-machine software licensing, the Software computes a deterministic, one-way cryptographic HMAC hash (<code>KRB-XXXX-XXXX-XXXX-XXXX</code>) derived from your computer's OS and hardware identifiers. Raw serial numbers are never transmitted externally.</p>

            <h2>3. Optional Third-Party Integrations (WhatsApp, SMTP Email &amp; Cube AI)</h2>
            <ul>
                <li><strong>Built-in WhatsApp Agent / API:</strong> When enabled by the store administrator, invoice PDFs and customer reminders are sent directly from your machine to WhatsApp using your linked phone session or configured provider.</li>
                <li><strong>SMTP Email:</strong> When configured, emails are sent directly through your chosen SMTP mail server using credentials stored locally in your database.</li>
                <li><strong>Cube AI Co-Pilot:</strong> When enabled with your Groq or Google Gemini API key, only the specific prompt and anonymized operational context needed to answer your question are sent to the selected AI provider.</li>
            </ul>

            <h2>4. Security &amp; Access Control</h2>
            <p>Administrator credentials created during installation are hashed using industry-standard bcrypt hashing. Role-based permissions govern staff access within the application.</p>
        @endif

        <div class="nav-links">
            <a href="/terms-of-service">Terms &amp; Conditions</a>
            <a href="/privacy-policy">Privacy Policy</a>
            <a href="/">Back to Karobar App</a>
        </div>
    </div>
</body>
</html>

