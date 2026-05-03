<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html lang="${locale.currentLanguageTag}">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>NITTE Admin Portal</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    <link rel="stylesheet" href="${url.resourcesPath}/css/nitte.css">
</head>
<body class="nitte-body">
    <div class="nitte-bg"></div>
    <div class="nitte-container">
        <div class="nitte-card">

            <div class="nitte-logo-wrap">
                <div class="nitte-logo-icon">N</div>
                <div>
                    <div class="nitte-logo-title">NITTE</div>
                    <div class="nitte-logo-sub">Admin &amp; DevOps Portal</div>
                </div>
            </div>

            <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                <div class="nitte-alert nitte-alert-${message.type}">
                    ${kcSanitize(message.summary)?no_esc}
                </div>
            </#if>

            <#nested "form">

            <#if displayInfo>
                <div class="nitte-info">
                    <#nested "info">
                </div>
            </#if>
        </div>

        <div class="nitte-footer">
            NITTE Alumni Merchandise Shop &nbsp;·&nbsp; Secure Login
        </div>
    </div>

    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
</body>
</html>
</#macro>
