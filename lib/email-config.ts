export type EmailAccountConfig = {
  index: number;
  name: string;
  address: string;
  password: string;
};

/** Reads EMAIL_1_*, EMAIL_2_*, EMAIL_3_* env vars */
export function getEmailAccounts(): EmailAccountConfig[] {
  const accounts: EmailAccountConfig[] = [];
  for (let i = 1; i <= 5; i++) {
    const address = process.env[`EMAIL_${i}_ADDRESS`]?.trim();
    const password = process.env[`EMAIL_${i}_PASSWORD`]?.trim();
    const name = process.env[`EMAIL_${i}_NAME`]?.trim() ?? address ?? `Account ${i}`;
    if (address && password) {
      accounts.push({ index: i, name, address, password });
    }
  }
  return accounts;
}

export function getEmailAccount(address: string): EmailAccountConfig | undefined {
  return getEmailAccounts().find((a) => a.address === address);
}

export const GMAIL_IMAP = { host: "imap.gmail.com", port: 993, secure: true };
export const GMAIL_SMTP = { host: "smtp.gmail.com", port: 587, secure: false };
