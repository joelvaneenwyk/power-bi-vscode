import * as vscode from 'vscode';

import { Helper } from '../../../helpers/Helper';
import { FABRIC_SCHEME } from './FabricFileSystemProvider';
import { FabricApiItemType } from '../../../fabric/_types';
import { ThisExtension } from '../../../ThisExtension';
import { FabricFSCacheItem } from './FabricFSCacheItem';
import { FabricFSWorkspace } from './FabricFSWorkspace';
import { FabricFSItemType } from './FabricFSItemType';
import { FabricFSItem } from './FabricFSItem';
import { FabricFSRoot } from './FabricFSRoot';
import { FabricApiService } from '../../../fabric/FabricApiService';

// regex with a very basic check for valid GUIDs
const REGEX_FABRIC_URI = /fabric:\/\/(?<workspace>[0-9a-fA-F-]{36})?(\/(?<itemType>[a-zA-Z]*))?(\/(?<Item>[0-9a-fA-F-]{36}))?(\/(?<part>.*))?($|\?)/gm

export enum FabricUriType {
	root = 1,
	workspace = 2,
	itemType = 3,
	item = 4,
	part = 5
}

export class FabricFSUri {
	private static _workspaceNameIdMap: Map<string, string> = new Map<string, string>();
	private static _itemNameIdMap: Map<string, string> = new Map<string, string>();
	

	uri: vscode.Uri;
	workspace?: string;
	itemType?: FabricApiItemType;
	item?: string;
	part: string;
	uriType: FabricUriType;

	/*
	fabric:/<workspace-id>/<itemType>/<item-id>/<partFolder/partfolder/partFile>
	*/
	constructor(uri: vscode.Uri) {
		this.uri = uri;

		let uriString = uri.toString();

		if (uriString.startsWith(FABRIC_SCHEME + ":/")) {
			let paths = uriString.split("/").filter((path) => path.length > 0).slice(1);
			this.workspace = paths[0];
			this.itemType = FabricApiItemType.fromString(paths[1]);
			this.item = paths[2];
			this.part = paths.slice(3).join("/");

			if(paths.length >= 5){
				this.uriType = FabricUriType.part;
			}
			else {
				this.uriType = paths.length + 1;
			}

			return
		}

		ThisExtension.log(`Fabric URI '${uri.toString()}' does not match pattern ${REGEX_FABRIC_URI}!`);

		throw vscode.FileSystemError.Unavailable("Invalid Fabric URI!");
	}

	static async getInstance(uri: vscode.Uri): Promise<FabricFSUri> {
		const fabricUri = new FabricFSUri(uri);

		if(!fabricUri.isValid) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}

		return fabricUri;
	}

	static async openInBrowser(uri: vscode.Uri): Promise<void> {
		const fabricUri = new FabricFSUri(uri);

		const baseUrl = vscode.Uri.joinPath(vscode.Uri.parse(FabricApiService.BrowserBaseUrl), "groups", fabricUri.workspaceId, fabricUri.itemTypeBrowserLink, fabricUri.itemId).toString();

		const tenantParam = FabricApiService.TenantId ? `?ctid=${FabricApiService.TenantId}` : "";
		const fullLink = `${baseUrl}${tenantParam}`;
		
		Helper.openLink(fullLink);
	}

	private get itemTypeBrowserLink(): string {
		switch(this.itemType) {
			case FabricApiItemType.Notebook: return "synapsenotebooks";
			case FabricApiItemType.SemanticModel: return "datasets";
			case FabricApiItemType.Report: return "reports";
			case FabricApiItemType.SparkJobDefinition: return "sparkjobdefinitions";
			default: return this.itemTypeText.toLowerCase() + "s";
		} 
	}

	get isValid(): boolean {
		if(this.uriType >= FabricUriType.itemType && !this.itemType) {
			return false;
		}

		// VSCode always checks for files in the root of the URI
		// as we can only have workspace IDs (GUIDs) or names from our NameIdMap, we can throw a FileNotFound error for all other files in the root
		if(this.workspace && !Helper.isGuid(this.workspace) && !FabricFSUri._workspaceNameIdMap.has(this.workspaceMapName))
		{
			return false;
		}
		if(this.item && !Helper.isGuid(this.item) && !FabricFSUri._itemNameIdMap.has(this.itemMapName))
		{
			return false;
		}

		return true;
	}

	get uniqueKey(): string {
		return this.uri.toString();
	}

	get workspaceId(): string {
		if(Helper.isGuid(this.workspace)) return this.workspace;

		return FabricFSUri._workspaceNameIdMap.get(this.workspaceMapName);
	}

	private get workspaceMapName(): string {
		return decodeURI(this.workspace);
	}

	private get itemMapName(): string {
		return decodeURI(`${this.workspaceId}/${this.itemTypeText}/${this.item}`);
	}

	get itemId(): string {
		if(Helper.isGuid(this.item)) return this.item;

		return FabricFSUri._itemNameIdMap.get(this.itemMapName);
	}

	get itemTypeText(): string {
		return FabricApiItemType[this.itemType];
	}



	public static addWorkspaceNameIdMap(workspaceName: string, workspaceId: string): void {
		FabricFSUri._workspaceNameIdMap.set(workspaceName, workspaceId);
	}

	public static addItemNameIdMap(itemName: string, itemId: string): void {
		FabricFSUri._itemNameIdMap.set(itemName, itemId);
	}
	
	private constructor_regex(uri: vscode.Uri) {
		let match: RegExpExecArray;

		this.uri = uri;

		match = REGEX_FABRIC_URI.exec(Helper.trimChar(uri.toString(), "/"));

		if (match) {
			this.workspace = match.groups["workspace"];
			this.itemType = FabricApiItemType.fromString(match.groups["itemType"]);
			this.item = match.groups["item"];
			this.part = match.groups["part"];

			return
		}

		ThisExtension.log(`Fabric URI '${uri.toString()}' does not match pattern ${REGEX_FABRIC_URI}!`);

		throw vscode.FileSystemError.Unavailable("Invalid Fabric URI!");
	}

	get uriTypeCalc(): FabricUriType {
		if (!this.workspace) {
			return FabricUriType.root;
		}
		else if (this.workspace && !this.itemType) {
			return FabricUriType.workspace;
		}
		else if (this.itemType && !this.item) {
			return FabricUriType.itemType;
		}
		else if (this.item && !this.part) {
			return FabricUriType.item;
		}
		else if (this.part) {
			return FabricUriType.part;
		}
		else {
			throw vscode.FileSystemError.Unavailable("Invalid Fabric URI!" + this.uri.toString());
		}
	}

	async getCacheItem<T = FabricFSCacheItem>(): Promise<T> {
		switch (this.uriType) {
			case FabricUriType.root:
				return new FabricFSRoot(this) as T;
			case FabricUriType.workspace:
				return new FabricFSWorkspace(this) as T;
			case FabricUriType.itemType:
				return new FabricFSItemType(this) as T;
			case FabricUriType.item:
				return new FabricFSItem(this) as T;
			case FabricUriType.part:
				return new FabricFSItem(this.fabricItemUri) as T;
		}
	}

	getCacheItemSync<T = FabricFSCacheItem>(): T {
		switch (this.uriType) {
			case FabricUriType.root:
				return new FabricFSRoot(this) as T;
			case FabricUriType.workspace:
				return new FabricFSWorkspace(this) as T;
			case FabricUriType.itemType:
				return new FabricFSItemType(this) as T;
			case FabricUriType.item:
				return new FabricFSItem(this) as T;
			case FabricUriType.part:
				return new FabricFSItem(this.fabricItemUri) as T;
		}
	}

	get cacheItemKey(): string {
		if(this.uriType == FabricUriType.part)
		{
			return this.fabricItemUri.cacheItemKey;
		}
		return this.uri.toString().replace("//", "/");
	}

	get fabricItemUri(): FabricFSUri {
		// fabric://<workspace-id>/<itemType>/<item-id>/<part1/part2/part3> to fabric://<workspace-id>/<itemType>/<item-id>
		let uri = vscode.Uri.parse(this.uri.toString().split("/").filter((path) => path.length > 0).slice(undefined, 4).join("/"));
		return new FabricFSUri(uri);
	}
}