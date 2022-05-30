import * as vscode from 'vscode';

import {  unique_id } from '../../../helpers/Helper';
import { PowerBIApiService } from '../../../powerbi/PowerBIApiService';

import { PowerBIWorkspaceTreeItem } from './PowerBIWorkspaceTreeItem';
import { iPowerBIDataflow } from '../../../powerbi/DataflowsAPI/_types';
import { PowerBIDataflow } from './PowerBIDataflow';
import { PowerBICommandBuilder } from '../../../powerbi/CommandBuilder';


// https://vshaxe.github.io/vscode-extern/vscode/TreeItem.html
export class PowerBIDataflows extends PowerBIWorkspaceTreeItem {

	constructor(groupId?: unique_id) {
		super("Dataflows", groupId, "DATAFLOWS", groupId);

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
			let children: PowerBIDataflow[] = [];
			let items: iPowerBIDataflow[] = await PowerBIApiService.getDataflows(this._group);

			for (let item of items) {
				let treeItem = new PowerBIDataflow(item, this.group);
				children.push(treeItem);
				PowerBICommandBuilder.pushQuickPickItem(treeItem);
			}
			
			return children;
		}
	}
}