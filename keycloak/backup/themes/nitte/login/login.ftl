<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title>NITTE Merchandise Portal</title>
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

      <form action="${url.loginAction}" method="post">

        <div class="field">
          <label for="username">Email</label>
          <input id="username" name="username" type="text"
                 value="${(login.username!'')}"
                 autofocus autocomplete="off"/>
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="off"/>
        </div>

        <#if realm.resetPasswordAllowed>
          <div class="forgot-row">
            <a href="${url.loginResetCredentialsUrl}">Forgot password?</a>
          </div>
        </#if>

        <input type="hidden" id="id-hidden-input" name="credentialId"
               <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>

        <input class="btn" type="submit" value="Sign In"/>
      </form>

    </div>
  </div>
</body>
</html>
