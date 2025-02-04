import axios, {
  Method,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosProgressEvent
} from 'axios';
import { clearToken } from '@/web/support/user/auth';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useSystemStore } from '../system/useSystemStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { i18nT } from '@fastgpt/web/i18n/utils';

interface ConfigType {
  headers?: { [key: string]: string };
  timeout?: number;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
  cancelToken?: AbortController;
  maxQuantity?: number; // The maximum number of simultaneous requests, usually used to cancel old requests
  withCredentials?: boolean;
}
interface ResponseDataType {
  code: number;
  message: string;
  data: any;
}

const maxQuantityMap: Record<
  string,
  {
    amount: number;
    sign: AbortController;
  }
> = {};

function checkMaxQuantity({ url, maxQuantity }: { url: string; maxQuantity?: number }) {
  if (maxQuantity) {
    const item = maxQuantityMap[url];
    const controller = new AbortController();

    if (item) {
      if (item.amount >= maxQuantity) {
        !item.sign?.signal?.aborted && item.sign?.abort?.();
        maxQuantityMap[url] = {
          amount: 1,
          sign: controller
        };
      } else {
        item.amount++;
      }
    } else {
      maxQuantityMap[url] = {
        amount: 1,
        sign: controller
      };
    }
    return controller;
  }
}
function requestFinish({ url }: { url: string }) {
  const item = maxQuantityMap[url];
  if (item) {
    item.amount--;
    if (item.amount <= 0) {
      delete maxQuantityMap[url];
    }
  }
}

/**
 * 请求开始
 */
function startInterceptors(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (config.headers) {
  }

  return config;
}

/**
 * 请求成功,检查请求头
 */
function responseSuccess(response: AxiosResponse<ResponseDataType>) {
  return response;
}
/**
 * 响应数据检查
 */
function checkRes(data: ResponseDataType) {
  if (data === undefined) {
    console.log('error->', data, 'data is empty');
    return Promise.reject('服务器异常');
  } else if (data.code < 200 || data.code >= 400) {
    return Promise.reject(data);
  }
  return data.data;
}

/**
 * 响应错误
 */
function responseError(err: any) {
  console.log('error->', '请求错误', err);
  const data = err?.response?.data || err;

  if (!err) {
    return Promise.reject({ message: '未知错误' });
  }
  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }
  if (typeof data === 'string') {
    return Promise.reject(data);
  }

  // 有报错响应
  if (data?.code in TOKEN_ERROR_CODE) {
    if (!['/chat/share', '/chat/team', '/login'].includes(window.location.pathname)) {
      clearToken();
      window.location.replace(
        getWebReqUrl(`/login?lastRoute=${encodeURIComponent(location.pathname + location.search)}`)
      );
    }

    return Promise.reject({ message: i18nT('common:unauth_token') });
  }
  if (
    data?.statusText === TeamErrEnum.aiPointsNotEnough ||
    data?.statusText === TeamErrEnum.datasetSizeNotEnough ||
    data?.statusText === TeamErrEnum.datasetAmountNotEnough ||
    data?.statusText === TeamErrEnum.appAmountNotEnough ||
    data?.statusText === TeamErrEnum.pluginAmountNotEnough ||
    data?.statusText === TeamErrEnum.websiteSyncNotEnough ||
    data?.statusText === TeamErrEnum.reRankNotEnough
  ) {
    useSystemStore.getState().setNotSufficientModalType(data.statusText);
    return Promise.reject(data);
  }
  return Promise.reject(data);
}

/* 创建请求实例 */
const instance = axios.create({
  timeout: 60000, // 超时时间
  headers: {
    'content-type': 'application/json'
  }
});

/* 请求拦截 */
instance.interceptors.request.use(startInterceptors, (err) => Promise.reject(err));
/* 响应拦截 */
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

function request(
  url: string,
  data: any,
  { cancelToken, maxQuantity, withCredentials, ...config }: ConfigType,
  method: Method
): any {
  /* 去空 */
  for (const key in data) {
    if (data[key] === undefined) {
      delete data[key];
    }
  }

  const controller = checkMaxQuantity({ url, maxQuantity });

  return instance
    .request({
      baseURL: getWebReqUrl('/api'),
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? data : undefined,
      params: !['POST', 'PUT'].includes(method) ? data : undefined,
      signal: cancelToken?.signal ?? controller?.signal,
      withCredentials,
      ...config // 用户自定义配置，可以覆盖前面的配置
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err))
    .finally(() => requestFinish({ url }));
}

/**
 * api请求方式
 * @param {String} url
 * @param {Any} params
 * @param {Object} config
 * @returns
 */
export function GET<T = undefined>(url: string, params = {}, config: ConfigType = {}): Promise<T> {
  return request(url, params, config, 'GET');
}

export function POST<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'POST');
}

export function PUT<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'PUT');
}

export function DELETE<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'DELETE');
}
