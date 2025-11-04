import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'biance-476510';

export async function getSecret(secretName: string): Promise<string> {
  try {
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString() || '';
    return payload;
  } catch (error) {
    console.error(`Failed to get secret ${secretName}:`, error);
    throw error;
  }
}

export async function loadSecrets() {
  const secrets = {
    DEEPSEEK_API_KEY: await getSecret('DEEPSEEK_API_KEY'),
    GEMINI_API_KEY: await getSecret('GEMINI_API_KEY'),
    GPT_API_KEY: await getSecret('GPT_API_KEY'),
    RSS_PROXY_URL: await getSecret('RSS_PROXY_URL'),
  };
  
  console.log('[SecretManager] All secrets loaded successfully');
  return secrets;
}

