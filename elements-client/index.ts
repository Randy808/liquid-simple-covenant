import { JSONRPCClient } from "json-rpc-2.0";
import fetch from "node-fetch";
import {
  GetBalanceResponse,
  IssueAssetResponse,
  SendToAddressResponse,
} from "./module";

//'http://admin1:123@localhost:18884'
var client = new JSONRPCClient(function (jsonRPCRequest) {
  return fetch("http://admin1:123@localhost:18884", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(jsonRPCRequest),
  }).then(async function (response) {
    if (response.status === 200) {
      // Use client.receive when you received a JSON-RPC response.
      return response.json().then(function (jsonRPCResponse) {
        return client.receive(jsonRPCResponse);
      });
    } else if (jsonRPCRequest.id !== undefined) {
      let error = await response.json();
      return Promise.reject(new Error(JSON.stringify(error)));
    }
  });
});

export default class ElementsClient {
  getBalance(): Promise<GetBalanceResponse> {
    return client.request("getbalance") as Promise<GetBalanceResponse>;
  }

  issueAsset(
    amount: number,
    reissuanceTokenAmount: number
  ): Promise<IssueAssetResponse> {
    return client.request(`issueasset`, [
      amount,
      reissuanceTokenAmount,
    ]) as Promise<IssueAssetResponse>;
  }

  sendToAddress(
    address: string,
    amount: number,
    assetId?: string
  ): Promise<string> {
    return client.request(`sendtoaddress`, {
      address,
      amount,
      assetlabel: assetId,
    }) as Promise<string>;
  }

  getRawTransaction(txId: string, isVerbose: boolean = false) {
    return client.request("getrawtransaction", {
      txid: txId,
      verbose: isVerbose,
    });
  }

  getRawClient() {
    return client;
  }
}
