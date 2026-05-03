<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title>NITTE Merchandise Portal — Verify</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/nitte.css"/>
</head>
<body>
  <div class="page">

    <p class="portal-title">NITTE Merchandise Portal</p>

    <div class="card">

      <#if message?has_content>
        <div class="alert alert-${message.type}">
          ${kcSanitize(message.summary)?no_esc}
        </div>
      </#if>

      <div class="otp-meta">
        <span class="otp-user">${login.username!''}</span>
        <a href="${url.loginRestartFlowUrl}" class="otp-restart">↺ Restart login</a>
      </div>

      <form action="${url.loginAction}" method="post">

        <div class="field">
          <label for="otp">One-time code</label>
          <input id="otp" name="otp" type="text"
                 autocomplete="off" inputmode="numeric"
                 maxlength="6" pattern="[0-9]*"
                 placeholder="000000" autofocus
                 class="otp-input"/>
          <#if messagesPerField.existsError('totp')>
            <span class="field-error">${kcSanitize(messagesPerField.get('totp'))?no_esc}</span>
          </#if>
        </div>

        <input type="submit" class="btn" value="Verify"/>
      </form>

    </div>
  </div>
</body>
</html>
