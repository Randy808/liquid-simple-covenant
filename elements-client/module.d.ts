export interface IssueAssetResponse {
  txid: string;
  vin: number;
  entropy: string;
  asset: string;
  token: string;
}

export interface GetBalanceResponse {
  [asset: string]: number;
}

export interface SendToAddressResponse {
  txid: string;
}
