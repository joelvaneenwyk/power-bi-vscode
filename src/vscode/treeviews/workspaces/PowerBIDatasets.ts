import * as vscode from 'vscode';

import {  unique_id } from '../../../helpers/Helper';
import { PowerBIApiService } from '../../../powerbi/PowerBIApiService';

import { PowerBIWorkspaceTreeItem } from './PowerBIWorkspaceTreeItem';
import { PowerBIDataset } from './PowerBIDataset';
import { iPowerBIDataset } from '../../../powerbi/DatasetsAPI/_types';
import { PowerBICommandBuilder } from '../../../powerbi/CommandBuilder';

// https://vshaxe.github.io/vscode-extern/vscode/TreeItem.html
export class PowerBIDatasets extends PowerBIWorkspaceTreeItem {

	constructor(groupId?: unique_id) {
		super("Datasets", groupId, "DATASETS", groupId);

		// the groupId is not unique for logical folders hence we make it unique
		super.id = groupId + this.item_type.toString();
	}

	async getChildren(element?: PowerBIWorkspaceTreeItem): Promise<PowerBIWorkspaceTreeItem[]> {
		if(!PowerBIApiService.isInitialized) { 			
			return Promise.resolve([]);
		}

		if (element != null && element != undefined) {
			return element.getChildren();
		}
		else {
			let children: PowerBIDataset[] = [];
			let items: iPowerBIDataset[] = await PowerBIApiService.getDatasets(this._group);

			for (let item of items) {
				let treeItem = new PowerBIDataset(item, this.group);
				children.push(treeItem);
				PowerBICommandBuilder.pushQuickPickItem(treeItem);
			}
			
			return children;
		}
	}
}