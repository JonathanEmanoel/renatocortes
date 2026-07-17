type CalendarEventInput = {
  serviceName: string;
  barberName: string;
  barbershopPhone: string;
  start: Date;
  durationMinutes: number;
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function getGoogleCalendarConfig() {
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    authUrl: GOOGLE_AUTH_URL,
    tokenUrl: GOOGLE_TOKEN_URL,
    eventsUrl: GOOGLE_EVENTS_URL,
    scope: GOOGLE_SCOPE
  };
}

export function buildGoogleCalendarAuthUrl(state: string) {
  const config = getGoogleCalendarConfig();

  if (!config.clientId || !config.redirectUri) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    access_type: "offline",
    prompt: "consent",
    state
  });

  return `${config.authUrl}?${params.toString()}`;
}

export function buildCalendarEvent(input: CalendarEventInput) {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);

  return {
    summary: "Agendamento - Renato Cortes Barbearia",
    location: "Renato Cortes Barbearia",
    description: [
      `Barbeiro: ${input.barberName}`,
      `Servico: ${input.serviceName}`,
      `Telefone da barbearia: ${input.barbershopPhone}`
    ].join("\n"),
    start: {
      dateTime: input.start.toISOString(),
      timeZone: "America/Sao_Paulo"
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: "America/Sao_Paulo"
    }
  };
}

export async function exchangeGoogleCodeForToken(code: string) {
  const config = getGoogleCalendarConfig();

  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error("Google Calendar credentials are not configured.");
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error("Could not authenticate with Google Calendar.");
  }

  return response.json() as Promise<{ access_token: string }>;
}

export async function createGoogleCalendarEvent(accessToken: string, event: ReturnType<typeof buildCalendarEvent>) {
  const response = await fetch(GOOGLE_EVENTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    throw new Error("Could not create Google Calendar event.");
  }

  return response.json();
}
