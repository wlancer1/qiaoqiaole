export type LoginRequest = (path: string, body: Record<string, unknown>) => Promise<any>;

type Dependencies = {
  request: LoginRequest;
  refreshFeatures: (token: string) => Promise<unknown>;
};

export function createAuthLoginFlows({ request, refreshFeatures }: Dependencies) {
  return {
    username: async (input: { username: string; password: string }) => {
      const response = await request('/auth/login', input);
      const token = response?.token;
      if (typeof token !== 'string' || !token) throw new Error('登录响应无效');
      await refreshFeatures(token);
      return response;
    },
    phone: async (input: { phone: string; password: string; [key: string]: unknown }) => {
      const response = await request('/v1/auth/sms/login', input);
      const token = response?.accessToken;
      if (typeof token !== 'string' || !token) throw new Error('登录响应无效');
      await refreshFeatures(token);
      return response;
    },
  };
}
