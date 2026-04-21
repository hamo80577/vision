# MFA And Assurance

Phase 6 introduces real MFA and assurance enforcement for sensitive internal roles.

## Sensitive Internal Marker

This phase uses a temporary `internal_sensitivity` marker on auth subjects:

- `none`
- `platform_admin`
- `tenant_owner`
- `branch_manager`

This field exists only for MFA policy and audit clarity in Phase 6. It is not the authorization model.

## Assurance Levels

Sessions now support:

- `basic`
- `mfa_verified`
- `step_up_verified`

The order is strict:

`basic < mfa_verified < step_up_verified`

`assurance_updated_at` records when the current assurance level was granted or refreshed.

## Login Behavior

- customers still receive a normal `basic` session
- non-sensitive internal users still receive a normal `basic` session
- sensitive internal users receive a short-lived assurance challenge after password verification
- a real auth cookie is only issued after MFA verification succeeds

## Supported Factors

- TOTP
- one-time backup codes

TOTP secrets are encrypted at rest. Backup codes are hashed at rest and shown only at generation time.

## Step-Up

Step-up uses the same assurance challenge primitive as login MFA, but it is bound to an existing authenticated session.

Phase 6 supports step-up reasons for:

- `tenant_context_switch`
- `support_grant_activation`
- `website_management_write`
- `data_export`
- `credential_reset`

## Boundary

Phase 6 owns authentication strength only.
Phase 7 owns authorization decisions.
