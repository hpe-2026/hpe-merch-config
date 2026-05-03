<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
    <div id="kc-form">
        <div id="kc-form-wrapper">
            <form id="kc-form-login" onsubmit="return true;" action="${url.loginAction}" method="post">

                <#if !usernameHidden??>
                <div class="nitte-field">
                    <label for="username" class="nitte-label">
                        <#if !realm.loginWithEmailAllowed>${msg("username")}
                        <#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}
                        <#else>${msg("email")}</#if>
                    </label>
                    <input tabindex="1" id="username" class="nitte-input" name="username" value="${(login.username!'')}"
                           type="text" autofocus autocomplete="off"
                           aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                    />
                    <#if messagesPerField.existsError('username','password')>
                        <span class="nitte-error" aria-live="polite">${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}</span>
                    </#if>
                </div>
                </#if>

                <div class="nitte-field">
                    <label for="password" class="nitte-label">${msg("password")}</label>
                    <div class="nitte-password-wrap">
                        <input tabindex="2" id="password" class="nitte-input" name="password" type="password"
                               autocomplete="off"
                               aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                        />
                    </div>
                </div>

                <div class="nitte-actions">
                    <#if realm.rememberMe && !usernameHidden??>
                        <div class="nitte-remember">
                            <label><input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox"
                                          <#if login.rememberMe??>checked</#if>> ${msg("rememberMe")}</label>
                        </div>
                    </#if>
                    <#if realm.resetPasswordAllowed>
                        <a tabindex="5" href="${url.loginResetCredentialsUrl}" class="nitte-link">${msg("doForgotPassword")}</a>
                    </#if>
                </div>

                <input type="hidden" id="id-hidden-input" name="credentialId"
                       <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>

                <input tabindex="4" class="nitte-btn" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>
            </form>
        </div>
    </div>
    </#if>
</@layout.registrationLayout>
