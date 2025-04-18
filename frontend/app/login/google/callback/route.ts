import { google } from "@/lib/oauth";
import { cookies } from "next/headers";
import { getUserFromGoogleId, storeTemporaryGoogleData } from "@/lib/db-utils";
import {
    generateSessionToken,
    createSession,
    setSessionTokenCookie
} from "@/lib/session";

export async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieStore = await cookies();
    const storedState = cookieStore.get("google_oauth_state")?.value ?? null;
    const codeVerifier = cookieStore.get("google_code_verifier")?.value ?? null;

    if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
        return new Response("Invalid state or missing parameters", { status: 400 });
    }

    try {
        const tokens = await google.validateAuthorizationCode(code, codeVerifier);
        console.log(tokens)
        const tk: string = tokens.accessToken();
        // Get user info from Google
        const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
                Authorization: `Bearer ${tk}`
            }
        });

        const googleUser = await userResponse.json();

        console.log(googleUser)

        const googleId = googleUser.id;
        const name = googleUser.name;
        const email = googleUser.email;

        // Check if user exists
        const existingUser = await getUserFromGoogleId(googleId);
        console.log(existingUser)

        if (existingUser) {
            // User exists - create session and redirect to dashboard
            const sessionToken = generateSessionToken();
            const session = await createSession(sessionToken, existingUser.id);
            await setSessionTokenCookie(sessionToken, session.expiresAt);

            return new Response(null, {
                status: 302,
                headers: {
                    Location: "/home"
                }
            });
        } else {
            // New user - store temp data and redirect to role selection
            const tempId = await storeTemporaryGoogleData(googleId, name, email);

            return new Response(null, {
                status: 302,
                headers: {
                    Location: `/choose-role?id=${tempId}`
                }
            });
        }
    } catch (error) {
        console.error("Google auth error:", error);
        return new Response("Authentication failed", { status: 400 });
    }
}
