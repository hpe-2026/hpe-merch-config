<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp'); section>
    <#if section = "header">
        ${msg("doLogIn")}
    <#elseif section = "form">
    <div id="kc-form">
        <div id="kc-form-wrapper">
            <p class="nitte-otp-hint">Enter the 6-digit code from your authenticator app.</p>
            <form id="kc-otp-login-form" action="${url.loginAction}" method="post">
                <div class="nitte-field">
                    <label for="otp" class="nitte-label">${msg("loginOtpOneTime")}</label>
                    <input tabindex="1" id="otp" name="otp" autocomplete="off" type="text"
                           class="nitte-input nitte-otp-input" autofocus
                           aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                           inputmode="numeric" maxlength="6" pattern="[0-9]*"
                    />
                    <#if messagesPerField.existsError('totp')>
                        <span class="nitte-error" aria-live="polite">${kcSanitize(messagesPerField.getFirstError('totp'))?no_esc}</span>
                    </#if>
                </div>
                <input class="nitte-btn" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>
            </form>
        </div>
    </div>
    </#if>
</@layout.registrationLayout>
