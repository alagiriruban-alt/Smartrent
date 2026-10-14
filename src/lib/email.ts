export type OutboundEmail = {
  to: string | null;
  subject: string;
  text: string;
};

export type EmailSendResult = {
  delivered: false;
  reason: "not-configured";
};

/**
 * Plug a provider in here when email should actually go out.
 * The reminder screen only previews messages.
 */
export interface EmailService {
  send(message: OutboundEmail): Promise<EmailSendResult>;
}

export class UnconfiguredEmailService implements EmailService {
  async send(message: OutboundEmail): Promise<EmailSendResult> {
    void message;
    return { delivered: false, reason: "not-configured" };
  }
}
