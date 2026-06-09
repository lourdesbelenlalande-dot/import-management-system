/**
 * Mock client for Sistema Informático Malvina (SIM) - AFIP/Aduana Argentina.
 * In production this would call the real Malvina REST/SOAP endpoints.
 */

export interface MalvinaDeclaration {
  referenceNumber: string;
  status: string;
  customsOffice: string;
  declarationDate: string;
}

export interface MalvinaRegistrationResult {
  success: boolean;
  referenceNumber?: string;
  error?: string;
}

class MalvinaClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.apiUrl = process.env.MALVINA_API_URL ?? 'https://api.malvina.gob.ar';
    this.apiKey = process.env.MALVINA_API_KEY ?? '';
  }

  async registerImportDeclaration(
    orderNumber: string,
    supplierCountry: string,
    totalValue: number,
  ): Promise<MalvinaRegistrationResult> {
    // Simulated response — replace with actual HTTP call when credentials are available
    await this.simulateNetworkDelay();

    if (!this.apiKey || this.apiKey === 'your_api_key_here') {
      // Return a mock reference so the system works in demo mode
      const ref = `MAL-${Date.now()}-${orderNumber}`;
      return { success: true, referenceNumber: ref };
    }

    try {
      // Real integration would be:
      // const response = await fetch(`${this.apiUrl}/declaraciones`, { ... });
      const ref = `MAL-${Date.now()}-${orderNumber}`;
      return { success: true, referenceNumber: ref };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async getDeclarationStatus(malvinaRef: string): Promise<MalvinaDeclaration | null> {
    await this.simulateNetworkDelay();
    return {
      referenceNumber: malvinaRef,
      status: 'EN_PROCESO',
      customsOffice: 'Ezeiza',
      declarationDate: new Date().toISOString(),
    };
  }

  private simulateNetworkDelay(): Promise<void> {
    return new Promise((r) => setTimeout(r, process.env.NODE_ENV === 'test' ? 0 : 50));
  }
}

export const malvinaClient = new MalvinaClient();
