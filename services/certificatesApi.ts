import { apiRequest, unwrapApiPayload } from './api/client';

export type CertificateRequirement = {
  met?: boolean;
  current?: number;
  required?: number | string;
  planType?: string;
};

export type CertificateStatus = {
  eligibility?: {
    eligible?: boolean;
    fee?: number;
    requirements?: {
      minimumExams?: CertificateRequirement;
      minimumAverage?: CertificateRequirement;
      qualifyingPlan?: CertificateRequirement;
    };
  };
  request?: {
    id?: string;
    _id?: string;
    status?: string;
    paymentStatus?: string;
    rejectionReason?: string;
  } | null;
  certificate?: {
    status?: string;
    certificateNumber?: string;
    hasDocument?: boolean;
  } | null;
};

export type CertificateRequestInput = {
  legalName: string;
  nationalId: string;
  contactPhone: string;
};

export type CertificatePaymentMethod = 'momo' | 'airtel' | 'card';

export type CertificatePaymentInput = {
  phone: string;
  payment_method: CertificatePaymentMethod;
  amount: number;
  card_number?: string;
  card_name?: string;
  card_cvc?: string;
  card_expdate?: string;
};

/** Read the authenticated user's certificate eligibility and current request state. */
export async function getMyCertificateStatus(accessToken: string): Promise<CertificateStatus> {
  const raw = await apiRequest<unknown>('/api/certificates/me', {
    method: 'GET',
    accessToken,
  });
  return unwrapApiPayload<CertificateStatus>(raw);
}

/** Submit the certificate request details after the user becomes eligible. */
export async function createCertificateRequest(
  accessToken: string,
  body: CertificateRequestInput,
): Promise<CertificateStatus> {
  const raw = await apiRequest<unknown>('/api/certificates/requests', {
    method: 'POST',
    accessToken,
    body,
  });
  return unwrapApiPayload<CertificateStatus>(raw);
}

/** Reapply after an administrator rejects a certificate request. */
export async function reapplyCertificateRequest(accessToken: string, requestId: string): Promise<CertificateStatus> {
  const raw = await apiRequest<unknown>(`/api/certificates/requests/${requestId}/reapply`, {
    method: 'POST',
    accessToken,
    body: {},
  });
  return unwrapApiPayload<CertificateStatus>(raw);
}

/** Start payment for an existing certificate request. This is separate from subscription payments. */
export async function payCertificateRequest(
  accessToken: string,
  requestId: string,
  body: CertificatePaymentInput,
): Promise<unknown> {
  const raw = await apiRequest<unknown>(`/api/certificates/requests/${encodeURIComponent(requestId)}/pay`, {
    method: 'POST',
    accessToken,
    body,
  });
  try {
    return unwrapApiPayload(raw);
  } catch {
    return raw;
  }
}

/** Poll the certificate-specific payment status endpoint. */
export async function checkCertificatePaymentStatus(accessToken: string, reqRef: string): Promise<unknown> {
  const raw = await apiRequest<unknown>('/api/certificates/payments/check-status', {
    method: 'POST',
    accessToken,
    body: { req_ref: reqRef },
  });
  try {
    return unwrapApiPayload(raw);
  } catch {
    return raw;
  }
}
