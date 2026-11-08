import { handleMcpRequest } from '../src/http-handler.js';

// The OpenAI app directory listing points here. Same server, corpus and
// answers as /mcp, but without the Start your strategy hand-over, because
// OpenAI's guidelines do not allow apps to promote paid services.
export default {
  fetch(request: Request): Promise<Response> {
    return handleMcpRequest(request, { endpoint: 'openai' });
  },
};
