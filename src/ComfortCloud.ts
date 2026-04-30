import * as https from "https";
import http from 'http';
import { RequestOptions } from "https";
import { URL } from "url";
import { HttpMethod } from "./models/HttpMethod";
import { DataMode, OperationMode } from "./models/enums";
import { Device, DeviceParameters, Group, GroupResponse, DeviceHistory } from "./models/interfaces";
import { LoginRequest } from "./models/LoginRequest";
import { LoginResponse } from "./models/LoginResponse";
import { UpdateResponse } from "./models/UpdateResponse";

export class ComfortCloud {
    private _config = {
        username: "",
        password: "",
        cc_app_url: "https://itunes.apple.com/lookup?id=1348640525",
        base_url: "https://accsmart.panasonic.com",
        login_url: "/auth/login",
        group_url: "/device/group",
        device_url: "/deviceStatus/{guid}",
        device_now_url: "/deviceStatus/now/{guid}",
        device_control_url: "/deviceStatus/control",
        device_history_url: "/deviceHistoryData",
    };

    private _accessToken: string = "";
    public get token(): string {
        return this._accessToken;
    }
    public set token(value: string) {
        this._accessToken = value;
    }

    private _clientId: string = "";
    public get clientId(): string {
        return this._clientId;
    }
    public set clientId(value: string) {
        this._clientId = value;
    }

    /**
     * Panasonic Comfort Cloud app version.
     */
    private _ccAppVersion: string;
    public get ccAppVersion(): string {
        return this._ccAppVersion;
    }
    public set ccAppVersion(value: string) {
        this._ccAppVersion = value;
    }

    constructor(username: string, password: string) {
        this._config.username = username;
        this._config.password = password;
        this._ccAppVersion = "1.17.0"; // This value will be replaced by value returned from Apple App Store.
    }

    /**
     * Returns Panasonic Comfort Cloud app version
     * @returns Version number as String
     */
    public async getCcAppVersion(): Promise<string> {
        try {
            const uri = new URL(this._config.cc_app_url);
            const options: RequestOptions = this.getRequestOptions(HttpMethod.Get, uri);
            const response = await this.request(options);
            const version = response?.results?.[0]?.version;
            if (typeof version === "string" && version.length > 0) return version;
        } catch (error) {
            console.error(error);
        }
        return this._ccAppVersion;
    }

    /**
     * Login to Panasonic Comfort Cloud
     * @param username Login username
     * @param password Login password
     * @returns LoginResponse containing access token.
     */
    public async login(username: string = this._config.username, password: string = this._config.password): Promise<LoginResponse | undefined> {
        if (!username || !password) throw new Error("Username and password must contain a value.");
        this._ccAppVersion = await this.getCcAppVersion();
        const data = new LoginRequest(username, password);
        const uri = new URL(`${this._config.base_url}${this._config.login_url}`);
        const options: RequestOptions = this.getRequestOptions(HttpMethod.Post, uri);
        const result = await this.request(options, JSON.stringify(data));
        if (result?.uToken) {
            this._accessToken = result.uToken;
            this._clientId = result.clientId;
            return result as LoginResponse;
        }
        return undefined;
    }

    /**
     * Get groups.
     * @returns A list of groups containing list of devices.
     */
    public async getGroups(): Promise<Group[]> {
        const uri = new URL(`${this._config.base_url}${this._config.group_url}`);
        const options: RequestOptions = this.getRequestOptions(HttpMethod.Get, uri);
        const result = await this.request(options);
        if (result?.groupCount > 0) {
            const data = result as GroupResponse;
            return data.groupList;
        }
        return [] as Group[];
    }

    /**
     * Returns device with the provided Device ID
     * @param deviceId Device ID to use. Aka deviceGuid
     * @returns Device based on deviceId
     */
    public async getDevice(deviceId: string): Promise<Device> {
        const uri = new URL(`${this._config.base_url}${this._config.device_url.replace("{guid}", deviceId)}`);
        const options: RequestOptions = this.getRequestOptions(HttpMethod.Get, uri);
        const result = await this.request(options);
        result.deviceGuid = deviceId;
        return result as Device;
    }

    /**
     * Returns device with the provided Device ID
     * @param deviceId Device ID to use. Aka deviceGuid
     * @returns Device based on deviceId
     */
    public async getDeviceNow(deviceId: string): Promise<Device> {
        const uri = new URL(`${this._config.base_url}${this._config.device_now_url.replace("{guid}", deviceId)}`);
        const options: RequestOptions = this.getRequestOptions(HttpMethod.Get, uri);
        const result = await this.request(options);
        result.deviceGuid = deviceId;
        return result as Device;
    }

    /**
     * Set parameters on device. Parameters can contain one or more properties.
     * @param deviceId Device ID to use. Aka deviceGuid
     * @param parameters Parameters to set
     * @returns
     */
    public async setParameters(deviceId: string, parameters: DeviceParameters): Promise<UpdateResponse> {
        try {
            const uri = new URL(`${this._config.base_url}${this._config.device_control_url}`);
            const options: RequestOptions = this.getRequestOptions(HttpMethod.Post, uri);
            const requestBody = { deviceGuid: deviceId, parameters: this.getParameters(parameters) };
            const result = await this.request(options, JSON.stringify(requestBody));
            const response: UpdateResponse = { status: -1, statusText: "Unknown response" };
            if (result) {
                response.status = result.result;
                response.statusText = "OK";
                return response;
            }
            return response;
        } catch (error: any) {
            if (error.statusCode === 401 || error.statusCode === 403) throw error;
            error.statusText = "Invalid parameter. Please check the input and use the Device's boolean values to check valid capabilities.";
            throw error;
        }
    }

    /**
     * Set parameters from device. Manipulate device parameters before calling.
     * @param device Device ID to be used
     * @returns true if recuest succeeds
     */
    public async setDevice(device: Device): Promise<UpdateResponse> {
        try {
            const parameters: DeviceParameters = this.getDeviceParameters(device);
            const res = await this.setParameters(device.deviceGuid, parameters);
            return res;
        } catch (error: any) {
            const res: UpdateResponse = { status: -1 };
            if (error && error.code && error.message) {
                res.error = error;
                res.status = error.code;
            }
            return res;
        }
    }

    public async getDeviceHistory(deviceId: string, dataMode: DataMode = 0, date: string, timezone: string = "+00:00"): Promise<DeviceHistory> {
        const uri = new URL(`${this._config.base_url}${this._config.device_history_url}`);
        const options: RequestOptions = this.getRequestOptions(HttpMethod.Post, uri);
        const requestBody = { deviceGuid: deviceId, dataMode: dataMode, date: date,osTimezone: timezone};
        const result = await this.request(options, JSON.stringify(requestBody));
        return result as DeviceHistory;
    }

    public getDeviceParameters(device: Device): DeviceParameters {
        const parameters: DeviceParameters = {};
        if (!device.parameters) return parameters;
        if (device.parameters.operate !== undefined) parameters.operate = device.parameters.operate;
        if (device.parameters.temperatureSet !== undefined) parameters.temperatureSet = device.parameters.temperatureSet;
        if (device.parameters.fanAutoMode !== undefined) parameters.fanAutoMode = device.parameters.fanAutoMode;
        if (device.parameters.airDirection !== undefined) parameters.airDirection = device.parameters.airDirection;
        if (device.parameters.airSwingLR !== undefined) parameters.airSwingLR = device.parameters.airSwingLR;
        if (device.parameters.airSwingUD !== undefined) parameters.airSwingUD = device.parameters.airSwingUD;
        if (device.parameters.fanSpeed !== undefined) parameters.fanSpeed = device.parameters.fanSpeed;
        if (device.parameters.ecoFunctionData !== undefined) parameters.ecoFunctionData = device.parameters.ecoFunctionData;
        if (device.parameters.ecoMode !== undefined) parameters.ecoMode = device.parameters.ecoMode;
        if (device.nanoeStandAlone && device.parameters.actualNanoe !== undefined) parameters.actualNanoe = device.parameters.actualNanoe;
        if (device.nanoe && device.parameters.nanoe !== undefined) parameters.nanoe = device.parameters.nanoe;
        if (
            (device.autoMode && device.parameters.operationMode === OperationMode.Auto) ||
            (device.coolMode && device.parameters.operationMode === OperationMode.Cool) ||
            (device.dryMode && device.parameters.operationMode === OperationMode.Dry) ||
            (device.heatMode && device.parameters.operationMode === OperationMode.Heat) ||
            (device.fanMode && device.parameters.operationMode === OperationMode.Fan)
        )
            parameters.operationMode = device.parameters.operationMode;
        return parameters;
    }

    public getParameters(parameters: DeviceParameters): DeviceParameters {
        const par: DeviceParameters = {};
        if (!parameters) return par;
        if (parameters.operate !== undefined) par.operate = parameters.operate;
        if (parameters.temperatureSet !== undefined) par.temperatureSet = parameters.temperatureSet;
        if (parameters.fanAutoMode !== undefined) par.fanAutoMode = parameters.fanAutoMode;
        if (parameters.airDirection !== undefined) par.airDirection = parameters.airDirection;
        if (parameters.airSwingLR !== undefined) par.airSwingLR = parameters.airSwingLR;
        if (parameters.airSwingUD !== undefined) par.airSwingUD = parameters.airSwingUD;
        if (parameters.fanSpeed !== undefined) par.fanSpeed = parameters.fanSpeed;
        if (parameters.actualNanoe !== undefined) par.actualNanoe = parameters.actualNanoe;
        if (parameters.nanoe !== undefined) par.nanoe = parameters.nanoe;
        if (parameters.ecoFunctionData !== undefined) par.ecoFunctionData = parameters.ecoFunctionData;
        if (parameters.ecoMode !== undefined) par.ecoMode = parameters.ecoMode;
        if (parameters.operationMode !== undefined) par.operationMode = parameters.operationMode;
        if (parameters.insideCleaning !== undefined) par.insideCleaning = parameters.insideCleaning;
        return par;
    }

    /**
     *
     * @param options RequestOprions to use
     * @param data optional data to use for request body
     * @returns Promise<any>
     */
    /**
     * Request timeout in milliseconds. 0 disables the timeout.
     */
    public requestTimeoutMs: number = 15000;

    private async request(options: https.RequestOptions, data?: any): Promise<any> {
        return await new Promise<any>((resolve, reject) => {
            const client = (options.protocol == "https:") ? https : http;
            try {
                const req = client.request(options, (res: any) => {
                    let str: string = "";
                    res.on("data", (chunk: string) => {
                        str += chunk;
                    });
                    res.on("end", () => {
                        const response: any = this.JsonTryParse(str);
                        const statusCode: number = Number(res?.statusCode);
                        if (statusCode >= 200 && statusCode < 300) {
                            resolve(response);
                        } else {
                            response.httpCode = res?.statusCode;
                            response.statusCode = res?.statusCode;
                            response.statusMessage = res?.statusMessage;
                            reject(response);
                        }
                    });
                });
                if (this.requestTimeoutMs > 0) {
                    req.setTimeout(this.requestTimeoutMs, () => {
                        req.destroy(new Error(`Request timed out after ${this.requestTimeoutMs}ms`));
                    });
                }
                req.on("error", (e: any) => {
                    reject(e);
                });
                if (data) {
                    req.write(data);
                }
                req.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     *
     * @param method HTTP method to use
     * @param uri Uri to use
     * @returns An object containing request options
     */
    private getRequestOptions(method: HttpMethod, uri: URL): https.RequestOptions {
        const path = `${uri.pathname}${uri.search ?? ""}`;
        const requestOptions: https.RequestOptions = {
            host: uri.host,
            port: uri.port,
            path: path,
            protocol: uri.protocol,
            method: method,
            headers: {
                Connection: "Keep-Alive",
                "Content-Type": "application/json; charset=utf-8",
                Accept: "application/json; charset=utf-8",
                Host: uri.hostname,
                "X-APP-TYPE": 1,
                "X-APP-VERSION": this._ccAppVersion,
                "X-APP-NAME": "Comfort Cloud",
                "X-APP-TIMESTAMP": "0",
                "X-CFC-API-KEY": "Comfort Cloud",
                "User-Agent": "G-RAC",
            },
        };

        if (this._accessToken && requestOptions.headers) {
            requestOptions.headers["X-User-Authorization"] = this._accessToken;
        }

        return requestOptions;
    }

    /**
     * Try to parse a string and return a valid JSON object. 
     * If string is not valid JSON, it will return an empty object instead.
     * @param input Input string to try to parse as a JSON object
     * @returns Parsed or empty Json object
     */
    private JsonTryParse(input: string): object {
        try {
            //check if the string exists
            if (input) {
                let o = JSON.parse(input);

                //validate the result too
                if (o && o.constructor === Object) {
                    return o;
                }
            }
        }
        catch (e: any) {
        }

        return { responseMessage: input };
    }
}
