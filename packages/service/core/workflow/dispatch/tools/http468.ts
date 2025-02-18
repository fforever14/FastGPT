import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import axios from 'axios';
import { formatHttpError, valueTypeFormat } from '../utils';
import { SERVICE_LOCAL_HOST } from '../../../../common/system/tools';
import { addLog } from '../../../../common/system/log';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  textAdaptGptResponse,
  replaceEditorVariable,
  formatVariableValByType,
  getReferenceVariableValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import { ContentTypes } from '@fastgpt/global/core/workflow/constants';
import { uploadFileFromBase64Img } from '../../../../common/file/gridfs/controller';
import { ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { createFileToken } from '../../../../support/permission/controller';
import { JSONPath } from 'jsonpath-plus';
import type { SystemPluginSpecialResponse } from '../../../../../plugins/type';
import json5 from 'json5';

type PropsArrType = {
  key: string;
  type: string;
  value: string;
};
type HttpRequestProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.abandon_httpUrl]: string;
  [NodeInputKeyEnum.httpMethod]: string;
  [NodeInputKeyEnum.httpReqUrl]: string;
  [NodeInputKeyEnum.httpHeaders]?: PropsArrType[];
  [NodeInputKeyEnum.httpParams]?: PropsArrType[];
  [NodeInputKeyEnum.httpJsonBody]?: string;
  [NodeInputKeyEnum.httpFormBody]?: PropsArrType[];
  [NodeInputKeyEnum.httpContentType]: ContentTypes;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
  [NodeInputKeyEnum.httpTimeout]?: number;
  [key: string]: any;
}>;
type HttpResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.error]?: object;
  [key: string]: any;
}>;

const UNDEFINED_SIGN = 'UNDEFINED_SIGN';

const contentTypeMap = {
  [ContentTypes.none]: '',
  [ContentTypes.formData]: '',
  [ContentTypes.xWwwFormUrlencoded]: 'application/x-www-form-urlencoded',
  [ContentTypes.json]: 'application/json',
  [ContentTypes.xml]: 'application/xml',
  [ContentTypes.raw]: 'text/plain'
};

export const dispatchHttp468Request = async (props: HttpRequestProps): Promise<HttpResponse> => {
  let {
    runningAppInfo: { id: appId, teamId, tmbId },
    chatId,
    responseChatItemId,
    variables,
    node,
    runtimeNodes,
    histories,
    workflowStreamResponse,
    params: {
      system_httpMethod: httpMethod = 'POST',
      system_httpReqUrl: httpReqUrl,
      system_httpHeader: httpHeader = [],
      system_httpParams: httpParams = [],
      system_httpJsonBody: httpJsonBody = '',
      system_httpFormBody: httpFormBody = [],
      system_httpContentType: httpContentType = ContentTypes.json,
      system_httpTimeout: httpTimeout = 60,
      [NodeInputKeyEnum.addInputParam]: dynamicInput,
      ...body
    }
  } = props;

  if (!httpReqUrl) {
    return Promise.reject('Http url is empty');
  }

  const systemVariables = {
    appId,
    chatId,
    responseChatItemId,
    histories: histories?.slice(-10) || []
  };
  const concatVariables = {
    ...variables,
    ...body,
    ...systemVariables
  };
  const allVariables: Record<string, any> = {
    [NodeInputKeyEnum.addInputParam]: concatVariables,
    ...concatVariables
  };

  // General data for variable substitution（Exclude: json body)
  const replaceStringVariables = (text: string) => {
    return replaceEditorVariable({
      text,
      nodes: runtimeNodes,
      variables: allVariables
    });
  };
  /* Replace the JSON string to reduce parsing errors
    1. Replace undefined values with null
    2. Replace newline strings
  */
  const replaceJsonBodyString = (text: string) => {
    const valToStr = (val: any) => {
      if (val === undefined) return 'null';
      if (val === null) return 'null';

      if (typeof val === 'object') return JSON.stringify(val);

      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          if (typeof parsed === 'object') {
            return JSON.stringify(parsed);
          }
          return val;
        } catch (error) {
          const str = JSON.stringify(val);
          return str.startsWith('"') && str.endsWith('"') ? str.slice(1, -1) : str;
        }
      }

      return String(val);
    };

    // 1. Replace {{key.key}} variables
    const regex1 = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
    const matches1 = [...text.matchAll(regex1)];
    matches1.forEach((match) => {
      const nodeId = match[1];
      const id = match[2];

      const variableVal = (() => {
        if (nodeId === VARIABLE_NODE_ID) {
          return variables[id];
        }
        // Find upstream node input/output
        const node = runtimeNodes.find((node) => node.nodeId === nodeId);
        if (!node) return;

        const output = node.outputs.find((output) => output.id === id);
        if (output) return formatVariableValByType(output.value, output.valueType);

        const input = node.inputs.find((input) => input.key === id);
        if (input)
          return getReferenceVariableValue({ value: input.value, nodes: runtimeNodes, variables });
      })();

      const formatVal = valToStr(variableVal);

      const regex = new RegExp(`\\{\\{\\$(${nodeId}\\.${id})\\$\\}\\}`, 'g');
      text = text.replace(regex, () => formatVal);
    });

    // 2. Replace {{key}} variables
    const regex2 = /{{([^}]+)}}/g;
    const matches2 = text.match(regex2) || [];
    const uniqueKeys2 = [...new Set(matches2.map((match) => match.slice(2, -2)))];
    for (const key of uniqueKeys2) {
      text = text.replace(new RegExp(`{{(${key})}}`, 'g'), () => valToStr(allVariables[key]));
    }

    return text.replace(/(".*?")\s*:\s*undefined\b/g, '$1: null');
  };

  httpReqUrl = replaceStringVariables(httpReqUrl);

  // parse header
  const headers = await (() => {
    try {
      const contentType = contentTypeMap[httpContentType];
      if (contentType) {
        httpHeader = [{ key: 'Content-Type', value: contentType, type: 'string' }, ...httpHeader];
      }

      if (!httpHeader || httpHeader.length === 0) return {};
      // array
      return httpHeader.reduce((acc: Record<string, string>, item) => {
        const key = replaceStringVariables(item.key);
        const value = replaceStringVariables(item.value);
        acc[key] = valueTypeFormat(value, WorkflowIOValueTypeEnum.string);
        return acc;
      }, {});
    } catch (error) {
      return Promise.reject('Header 为非法 JSON 格式');
    }
  })();

  const params = httpParams.reduce((acc: Record<string, string>, item) => {
    const key = replaceStringVariables(item.key);
    const value = replaceStringVariables(item.value);
    acc[key] = valueTypeFormat(value, WorkflowIOValueTypeEnum.string);
    return acc;
  }, {});

  const requestBody = await (() => {
    if (httpContentType === ContentTypes.none) return {};
    try {
      if (httpContentType === ContentTypes.formData) {
        if (!Array.isArray(httpFormBody)) return {};
        httpFormBody = httpFormBody.map((item) => ({
          key: replaceStringVariables(item.key),
          type: item.type,
          value: replaceStringVariables(item.value)
        }));
        const formData = new FormData();
        for (const { key, value } of httpFormBody) {
          formData.append(key, value);
        }
        return formData;
      }
      if (httpContentType === ContentTypes.xWwwFormUrlencoded) {
        if (!Array.isArray(httpFormBody)) return {};
        httpFormBody = httpFormBody.map((item) => ({
          key: replaceStringVariables(item.key),
          type: item.type,
          value: replaceStringVariables(item.value)
        }));
        const urlSearchParams = new URLSearchParams();
        for (const { key, value } of httpFormBody) {
          urlSearchParams.append(key, value);
        }
        return urlSearchParams;
      }
      if (!httpJsonBody) return {};
      if (httpContentType === ContentTypes.json) {
        httpJsonBody = replaceJsonBodyString(httpJsonBody);
        return json5.parse(httpJsonBody);
      }

      // Raw text, xml
      httpJsonBody = replaceStringVariables(httpJsonBody);
      return httpJsonBody.replaceAll(UNDEFINED_SIGN, 'null');
    } catch (error) {
      return Promise.reject(`Invalid JSON body: ${httpJsonBody}`);
    }
  })();

  // Just show
  const formattedRequestBody: Record<string, any> = (() => {
    if (requestBody instanceof FormData || requestBody instanceof URLSearchParams) {
      return Object.fromEntries(requestBody);
    } else if (typeof requestBody === 'string') {
      try {
        return json5.parse(requestBody);
      } catch {
        return { content: requestBody };
      }
    } else if (typeof requestBody === 'object' && requestBody !== null) {
      return requestBody;
    }
    return {};
  })();

  try {
    const { formatResponse, rawResponse } = await (async () => {
      const systemPluginCb = global.systemPluginCb;
      if (systemPluginCb[httpReqUrl]) {
        const pluginResult = await replaceSystemPluginResponse({
          response: await systemPluginCb[httpReqUrl](requestBody),
          teamId,
          tmbId
        });

        return {
          formatResponse: pluginResult,
          rawResponse: pluginResult
        };
      }
      return fetchData({
        method: httpMethod,
        url: httpReqUrl,
        headers,
        body: requestBody,
        params,
        timeout: httpTimeout
      });
    })();

    // format output value type
    const results: Record<string, any> = {};
    node.outputs
      .filter(
        (item) =>
          item.id !== NodeOutputKeyEnum.error &&
          item.id !== NodeOutputKeyEnum.httpRawResponse &&
          item.id !== NodeOutputKeyEnum.addOutputParam
      )
      .forEach((item) => {
        const key = item.key.startsWith('$') ? item.key : `$.${item.key}`;
        results[item.key] = (() => {
          const result = JSONPath({ path: key, json: formatResponse });

          // 如果结果为空,返回 undefined
          if (!result || result.length === 0) {
            return undefined;
          }

          // 以下情况返回数组:
          // 1. 使用通配符 *
          // 2. 使用数组切片 [start:end]
          // 3. 使用过滤表达式 [?(...)]
          // 4. 使用递归下降 ..
          // 5. 使用多个结果运算符 ,
          const needArrayResult = /[*]|[\[][:?]|\.\.|\,/.test(key);

          return needArrayResult ? result : result[0];
        })();
      });

    if (typeof formatResponse[NodeOutputKeyEnum.answerText] === 'string') {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.fastAnswer,
        data: textAdaptGptResponse({
          text: formatResponse[NodeOutputKeyEnum.answerText]
        })
      });
    }

    return {
      ...results,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: 0,
        params: Object.keys(params).length > 0 ? params : undefined,
        body: Object.keys(formattedRequestBody).length > 0 ? formattedRequestBody : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        httpResult: rawResponse
      },
      [DispatchNodeResponseKeyEnum.toolResponses]:
        Object.keys(results).length > 0 ? results : rawResponse,
      [NodeOutputKeyEnum.httpRawResponse]: rawResponse
    };
  } catch (error) {
    addLog.error('Http request error', error);

    return {
      [NodeOutputKeyEnum.error]: formatHttpError(error),
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        params: Object.keys(params).length > 0 ? params : undefined,
        body: Object.keys(formattedRequestBody).length > 0 ? formattedRequestBody : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        httpResult: { error: formatHttpError(error) }
      },
      [NodeOutputKeyEnum.httpRawResponse]: getErrText(error)
    };
  }
};

async function fetchData({
  method,
  url,
  headers,
  body,
  params,
  timeout
}: {
  method: string;
  url: string;
  headers: Record<string, any>;
  body: Record<string, any> | string;
  params: Record<string, any>;
  timeout: number;
}) {
  const { data: response } = await axios({
    method,
    baseURL: `http://${SERVICE_LOCAL_HOST}`,
    url,
    headers: {
      ...headers
    },
    timeout: timeout * 1000,
    params: params,
    data: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined
  });

  return {
    formatResponse: typeof response === 'object' ? response : {},
    rawResponse: response
  };
}

// Replace some special response from system plugin
async function replaceSystemPluginResponse({
  response,
  teamId,
  tmbId
}: {
  response: Record<string, any>;
  teamId: string;
  tmbId: string;
}) {
  for await (const key of Object.keys(response)) {
    if (typeof response[key] === 'object' && response[key].type === 'SYSTEM_PLUGIN_BASE64') {
      const fileObj = response[key] as SystemPluginSpecialResponse;
      const filename = `${tmbId}-${Date.now()}.${fileObj.extension}`;
      try {
        const fileId = await uploadFileFromBase64Img({
          teamId,
          tmbId,
          bucketName: 'chat',
          base64: fileObj.value,
          filename,
          metadata: {}
        });
        response[key] = `${ReadFileBaseUrl}/${filename}?token=${await createFileToken({
          bucketName: 'chat',
          teamId,
          uid: tmbId,
          fileId
        })}`;
      } catch (error) {}
    }
  }
  return response;
}
