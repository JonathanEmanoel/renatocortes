/**
 * Adaptador OAuth/Calendar chamado pelas rotas Google apos autenticar o cliente.
 * Monta o evento a partir do agendamento e publica no calendario primario.
 * Validacao de state e propriedade do agendamento pertencem as rotas; este
 * modulo nao persiste tokens nem evita eventos duplicados por si so.
 */
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

/** Le credenciais do ambiente servidor; o objeto inclui segredo e nao deve ir ao cliente. */
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

/**
 * Prepara consentimento OAuth com state fornecido pela rota para correlacionar
 * o retorno. Sem clientId/redirectUri retorna null para indicar integracao indisponivel.
 */
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

/**
 * Converte inicio e duracao em intervalo absoluto ISO, declarando Sao Paulo
 * para exibicao no Calendar. Nao valida disponibilidade nem cria agendamento.
 */
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

/**
 * Troca o codigo de autorizacao por token no servidor, usando o segredo OAuth.
 * Falha antes de publicar evento se configuracao ou resposta do Google for invalida.
 */
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

/**
 * Publica um novo evento com o token recebido; cada chamada bem-sucedida cria
 * outro evento. O chamador e responsavel por autorizar e controlar repeticoes.
 */
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
