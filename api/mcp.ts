import { handleMcpRequest } from '../src/http-handler.js';

export default {
  fetch(request: Request): Promise<Response> {
    return handleMcpRequest(request);
  },
};
