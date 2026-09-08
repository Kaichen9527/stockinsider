import {
  createThreadsDeletionConfirmationCode,
  hashThreadsUserId,
  readThreadsSignedRequest,
  threadsDeletionStatusUrl,
  verifyThreadsSignedRequest,
} from './threads-signed-request.ts';

export type ThreadsLifecycleRevocation = {
  confirmationCode: string;
  requestKind: 'deauthorize' | 'data_deletion';
  signedRequest: string;
  userIdHash: string;
};

export async function processThreadsLifecycleCallback(input: {
  appId: string;
  appSecret: string;
  kind: 'deauthorize' | 'data_deletion';
  redirectUri: string;
  request: Request;
  revoke: (revocation: ThreadsLifecycleRevocation) => Promise<void>;
}): Promise<Record<string, unknown>> {
  const signedRequest = await readThreadsSignedRequest(input.request);
  const payload = verifyThreadsSignedRequest(signedRequest, input.appSecret);
  const confirmationCode = createThreadsDeletionConfirmationCode(signedRequest, input.appSecret);
  await input.revoke({
    confirmationCode,
    requestKind: input.kind,
    signedRequest,
    userIdHash: hashThreadsUserId(payload.user_id, input.appId),
  });
  if (input.kind === 'deauthorize') return { success: true };
  return {
    url: threadsDeletionStatusUrl(confirmationCode, input.redirectUri),
    confirmation_code: confirmationCode,
  };
}
