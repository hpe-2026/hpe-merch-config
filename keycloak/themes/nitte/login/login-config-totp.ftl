<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title>NITTE Merchandise Portal — 2FA Setup</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/nitte.css"/>
</head>
<body>
  <div class="page">

    <p class="portal-title">NITTE Merchandise Portal</p>

    <div class="card totp-card">

      <h2 class="totp-heading">Set up two-factor authentication</h2>
      <p class="totp-sub">Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code below.</p>

      <#if message?has_content>
        <div class="alert alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <div class="qr-wrap">
        <img src="data:image/png;base64, ${totp.totpSecretQrCode}" alt="QR Code" class="qr-img"/>
      </div>

      <details class="manual-wrap">
        <summary>Can't scan? Enter key manually</summary>
        <p class="manual-key">${totp.totpSecretEncoded}</p>
      </details>

      <form action="${url.loginAction}" method="post">
        <input type="hidden" name="totp-hidden" id="totp-hidden"/>

        <div class="field">
          <label for="totp">One-time code</label>
          <input id="totp" name="totp" type="text"
                 autocomplete="off" inputmode="numeric"
                 maxlength="6" pattern="[0-9]*"
                 placeholder="000000" autofocus/>
        </div>

        <div class="field">
          <label for="userLabel">Device name <span class="optional">(optional)</span></label>
          <input id="userLabel" name="userLabel" type="text"
                 autocomplete="off" placeholder="e.g. My Phone"/>
        </div>

        <input type="submit" class="btn" value="Activate 2FA"/>
      </form>

    </div>
  </div>
</body>
</html>
