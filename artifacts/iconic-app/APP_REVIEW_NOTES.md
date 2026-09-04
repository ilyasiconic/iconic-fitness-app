# Iconic Fitness App Review Checklist

Use this checklist for the replacement iOS build. Do not resubmit build 7.

## App Review Information

- Sign-in required: **Yes**
- Contact information: enter an actively monitored name, phone number, and email
- Username: enter the dedicated production **member demo mobile number**
- Password: enter that member's production password
- Notes: paste the template below after replacing every bracketed placeholder

Do not use an OTP-only member account: App Review will not have access to its
email inbox. Do not put either password in this file or in source control.

## Notes template

Hello App Review,

Thank you for the guidance. This replacement build addresses both issues:

1. Sign in with Apple is now offered alongside Google anywhere social login is
   available.
2. Working production member and staff demo accounts are provided below, with
   steps to reach both areas.

MEMBER ACCESS

1. Launch the app.
2. Tap **Membership Login**.
3. Tap **Log in with mobile number & password**.
4. Mobile number: [MEMBER DEMO MOBILE]
5. Password: [MEMBER DEMO PASSWORD]

The member account contains representative membership and fitness data so the
main member features can be reviewed. The **Continue without login** option is
limited guest access and is not the reviewer account.

STAFF ACCESS

1. Sign out if currently signed in as a member, then return to the welcome
   screen.
2. Tap **Staff Login**.
3. Under **or with credentials**, enter:
4. Username or email: [STAFF DEMO USERNAME]
5. Password: [STAFF DEMO PASSWORD]
6. Tap **Log in to studio**.

The staff account is active and has reviewer-appropriate access to the studio
workspace. Apple and Google staff SSO remain restricted to verified email
addresses that an administrator has already registered; they never create
staff access automatically.

No purchase is required to review the app. Location, camera, photo library, and
notification permissions are optional and may be declined.

## Before resubmission

- Confirm both accounts work against the published production API
- Confirm the member account has representative non-sensitive demo content
- Confirm the staff account is active and has enough permissions to inspect the
  submitted functionality
- Test every credential exactly as entered in App Store Connect
- Select the new build, expected to auto-increment from build 7
- Paste the notes above and reply to the Resolution Center
