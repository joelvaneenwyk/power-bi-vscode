import * as vscode from 'vscode';

import { Helper, UniqueId } from '../../../helpers/Helper';
import { PowerBIApiService } from '../../../powerbi/PowerBIApiService';

import { PowerBIWorkspaceTreeItem } from './PowerBIWorkspaceTreeItem';
import { iPowerBIDataset, iPowerBIDatasetGenericResponse, iPowerBIDatasetParameter, iPowerBIDatasetRefreshableObject } from '../../../powerbi/DatasetsAPI/_types';
import { PowerBICommandBuilder, PowerBICommandInput, PowerBIQuickPickItem } from '../../../powerbi/CommandBuilder';
import { ThisExtension } from '../../../ThisExtension';
import { PowerBIParameters } from './PowerBIParameters';
import { PowerBIDatasetRefreshes } from './PowerBIDatasetRefreshes';
import { PowerBIWorkspace } from './PowerBIWorkspace';
import { PowerBIParameter } from './PowerBIParameter';
import { PowerBIApiTreeItem } from '../PowerBIApiTreeItem';
import { TMDL_SCHEME } from '../../filesystemProvider/TMDLFileSystemProvider';
import { TMDLFSUri } from '../../filesystemProvider/TMDLFSUri';
import { TMDLProxy } from '../../../TMDLVSCode/TMDLProxy';
import { TOMProxyBackup, TOMProxyRestore } from '../../../TMDLVSCode/_typesTOM';
import { PowerBIDatasetTables } from './PowerBIDatasetTables';

// https://vshaxe.github.io/vscode-extern/vscode/TreeItem.html
export class PowerBIDataset extends PowerBIWorkspaceTreeItem implements TOMProxyBackup, TOMProxyRestore {

	constructor(
		definition: iPowerBIDataset,
		groupId: UniqueId,
		parent: PowerBIWorkspaceTreeItem
	) {
		super(definition.name, groupId, "DATASET", definition.id, parent, vscode.TreeItemCollapsibleState.Collapsed);

		this.definition = definition;

		this.tooltip = this._tooltip;
		this.contextValue = this._contextValue;
	}

	/* Overwritten properties from PowerBIApiTreeItem */
	get _contextValue(): string {
		let orig: string = super._contextValue;

		let actions: string[] = [
			"REFRESH",
			"DELETE"
		]

		if (this.definition.configuredBy != PowerBIApiService.SessionUserEmail) {
			actions.push("TAKEOVER");
		}
		else {
			actions.push("UPDATEDATASETPARAMETERS")
		}

		if (this.workspace.definition.isOnDedicatedCapacity) {
			actions.push("CONFIGURESCALEOUT");
			actions.push("EDIT_TMDL");
			actions.push("BACKUP");
			actions.push("RESTORE");
			actions.push("COPY_CONNECTIONSTRING");

			if (this.definition.queryScaleOutSettings?.maxReadOnlyReplicas != 0) {
				actions.push("SYNCREADONLYREPLICAS");
			}
		}

		return orig + actions.join(",") + ",";
	}

	get definition(): iPowerBIDataset {
		return super.definition as iPowerBIDataset;
	}

	private set definition(value: iPowerBIDataset) {
		super.definition = value;
	}

	get canDoChanges(): boolean {
		return "" == this.definition.configuredBy;
	}

	async getXMLACConnectionString(): Promise<string> {
		return PowerBIApiService.getXmlaConnectionString(this.workspace.name, this.name);
	}

	get asQuickPickItem(): PowerBIQuickPickItem {
		const qpItem = new PowerBIQuickPickItem(this.name, this.uid.toString(), this.uid.toString(), `Workspace: ${this.workspace.name} (ID: ${this.workspace.uid})`);
		qpItem.apiItem = this;

		return qpItem;
	}

	async getChildren(element?: PowerBIWorkspaceTreeItem): Promise<PowerBIWorkspaceTreeItem[]> {
		let children: PowerBIWorkspaceTreeItem[] = [];

		children.push(new PowerBIParameters(this.groupId, this));
		children.push(new PowerBIDatasetRefreshes(this.groupId, this));
		children.push(new PowerBIDatasetTables(this.groupId, this));

		return children;
	}

	// Dataset-specific funtions
	get workspace(): PowerBIWorkspace {
		return this.getParentByType<PowerBIWorkspace>("GROUP");
	}

	public async delete(): Promise<void> {
		await PowerBIApiTreeItem.delete(this, "yesNo");

		ThisExtension.TreeViewWorkspaces.refresh(this.parent, false);
	}

	public static async refreshById(workspaceId: string, datasetId: string, isOnDedicatedCapacity: boolean, objectsToRefresh?: iPowerBIDatasetRefreshableObject[]): Promise<void> {
		ThisExtension.setStatusBarRight("Triggering dataset-refresh ...", true);
		const apiUrl = Helper.joinPath("groups", workspaceId, "datasets", datasetId, "refreshes");

		let body = null;

		// if we are on premium, we can use the Enhanced Refresh API
		if (isOnDedicatedCapacity) {
			const processType: vscode.QuickPickItem = await vscode.window.showQuickPick(PROCESSING_TYPES, {
				//placeHolder: toolTip,
				ignoreFocusOut: true
				/*,
				onDidSelectItem: item => window.showInformationMessage(`Focus ${++i}: ${item}`)
				*/
			});
			if (processType == undefined || processType == null) {
				ThisExtension.setStatusBarRight("Dataset-refresh aborted!");
				Helper.showTemporaryInformationMessage("Dataset-refresh aborted!", 3000);
				return;
			}
			body = {
				"type": processType.label
			}

			if (objectsToRefresh) {
				body["objects"] = objectsToRefresh;
			}
		}

		await PowerBIApiService.post(apiUrl, body);
		ThisExtension.setStatusBarRight("Dataset-refresh triggered!");
		Helper.showTemporaryInformationMessage("Dataset-refresh triggered!", 3000);
	}

	public async refresh(): Promise<void> {
		const isOnDedicatedCapacity = this.workspace.definition.isOnDedicatedCapacity;
		await PowerBIDataset.refreshById(this.groupId.toString(), this.id, isOnDedicatedCapacity);

		await Helper.delay(1000);
		ThisExtension.TreeViewWorkspaces.refresh(this, false);
	}

	public async takeOver(): Promise<void> {
		ThisExtension.setStatusBarRight("Taking over dataset ...", true);

		const apiUrl = Helper.joinPath(this.apiPath, "Default.TakeOver");
		PowerBIApiService.post(apiUrl, null);
		ThisExtension.setStatusBarRight("Dataset taken over!");

		ThisExtension.TreeViewWorkspaces.refresh(this.parent, false);
	}

	public async configureScaleOut(): Promise<void> {
		ThisExtension.setStatusBarRight("Configuring Dataset Scale-Out ...", true);

		const apiUrl = this.apiPath;

		let response = await PowerBICommandBuilder.execute<iPowerBIDatasetGenericResponse>(apiUrl, "PATCH",
			[
				new PowerBICommandInput("Max Read-Only Replicas", "FREE_TEXT", "queryScaleOutSettings.maxReadOnlyReplicas", false, "Maximum number of read-only replicas for the dataset (0-64, -1 for automatic number of replicas)", this.definition.queryScaleOutSettings?.maxReadOnlyReplicas.toString()),
				new PowerBICommandInput("Workspace", "CUSTOM_SELECTOR", "queryScaleOutSettings.autoSyncReadOnlyReplicas", false, "Whether the dataset automatically syncs read-only replicas.", this.definition.queryScaleOutSettings?.autoSyncReadOnlyReplicas.toString(), [new PowerBIQuickPickItem("true"), new PowerBIQuickPickItem("false")])
			]);

		if (response.error) {
			vscode.window.showErrorMessage(JSON.stringify(response));
		}

		ThisExtension.setStatusBarRight("Dataset Scale-Out configured!");

		await Helper.delay(1000);
		ThisExtension.TreeViewWorkspaces.refresh(this.parent, false);
	}

	public async syncReadOnlyReplicas(): Promise<void> {
		ThisExtension.setStatusBarRight("Starting RO replica sync ...", true);

		const apiUrl = Helper.joinPath(this.apiPath, "queryScaleOut", "sync");
		var response = await PowerBIApiService.post<iPowerBIDatasetGenericResponse>(apiUrl, null);

		if (response.error) {
			vscode.window.showErrorMessage(JSON.stringify(response));
		}

		ThisExtension.setStatusBarRight("RO replica sync started!");

		await Helper.delay(1000);
		ThisExtension.TreeViewWorkspaces.refresh(this.parent, false);
	}

	public async backup(): Promise<void> {
		const backupFileName = await PowerBICommandBuilder.showInputBox(this.name + ".abf", "Enter the name of the backup file", undefined);
		if (!backupFileName) {
			Helper.showTemporaryInformationMessage("Backup aborted!");
			return;
		}

		const allowOverwrite = await PowerBICommandBuilder.showQuickPick([new PowerBIQuickPickItem("yes"), new PowerBIQuickPickItem("no")], `Overwrite existing backup (if exists)?`, undefined, undefined);
		if (!allowOverwrite) {
			Helper.showTemporaryInformationMessage("Backup aborted!");
			return;
		}

		await TMDLProxy.backup(this.workspace.name, this.name, backupFileName, allowOverwrite == "yes");
	}

	public async restore(): Promise<void> {
		const backupFileName = await PowerBICommandBuilder.showInputBox(this.name + ".abf", "Enter the name of the backup file", undefined);
		if (!backupFileName) {
			Helper.showTemporaryInformationMessage("Restore aborted!");
			return;
		}

		const allowOverwrite = await PowerBICommandBuilder.showQuickPick([new PowerBIQuickPickItem("yes"), new PowerBIQuickPickItem("no")], `Overwrite existing database?`, `Database ${this.name} will be overwritten with the contents of ${backupFileName}.`, undefined);
		if (!allowOverwrite) {
			Helper.showTemporaryInformationMessage("Restore aborted!");
			return;
		}
		await TMDLProxy.restore(backupFileName, this.workspace.name, this.name, allowOverwrite == "yes");
	}

	public async editTMDL(): Promise<void> {
		const tmdlUri = new TMDLFSUri(vscode.Uri.parse(`${TMDL_SCHEME}:/powerbi/${this.workspace.name}/${this.name}`))

		await Helper.addToWorkspace(tmdlUri.uri, `TMDL - ${this.name}`);
		// if the workspace does not exist, the folder is opened in a new workspace where the TMDL folder would be reloaded again
		// so we only load the model if we already have a workspace

		await vscode.commands.executeCommand("workbench.files.action.focusFilesExplorer", tmdlUri.uri);
	}

	public async updateAllParameters(): Promise<void> {
		const apiUrl = Helper.joinPath(this.apiPath, "Default.UpdateParameters");
		let parameters: iPowerBIDatasetParameter[] = await PowerBIApiService.getItemList<iPowerBIDatasetParameter>(this.apiPath + "parameters");

		let updateDetails: { name: string, newValue: string }[] = [];
		for (let parameter of parameters) {
			let newValue: { name: string, newValue: string } = await PowerBIParameter.promptForValue(parameter)

			if (newValue) {
				updateDetails.push(newValue);
			}
		}

		let settings = {
			"updateDetails": updateDetails
		}

		ThisExtension.setStatusBarRight("Updating parameter ...", true);
		await PowerBIApiService.post(apiUrl, settings);
		ThisExtension.setStatusBarRight("Parameter updated!")

		await ThisExtension.TreeViewWorkspaces.refresh(this.parent, false);
	}

	public async copyConnectionString(): Promise<void> {
		vscode.env.clipboard.writeText(await this.getXMLACConnectionString());
	}
}

export const PROCESSING_TYPES: vscode.QuickPickItem[] = [
	{
		"label": "full",
		"detail": "Processes an SQL Server Analysis Services object and all the objects that it contains. When Process Full is executed against an object that has already been processed, SQL Server Analysis Services drops all data in the object, and then processes the object. This kind of processing is required when a structural change has been made to an object, for example, when an attribute hierarchy is added, deleted, or renamed."
	},
	{
		"label": "clearValues",
		"detail": "Drops the data in the object specified and any lower-level constituent objects. After the data is dropped, it is not reloaded."
	},
	{
		"label": "calculate",
		"detail": "Updates and recalculates hierarchies, relationships, and calculated columns."
	},
	{
		"label": "dataOnly",
		"detail": "Processes data only without building aggregations or indexes. If there is data is in the partitions, it will be dropped before re-populating the partition with source data."
	},
	{
		"label": "automatic",
		"detail": "Detects the process state of database objects, and performs processing necessary to deliver unprocessed or partially processed objects to a fully processed state. If you change a data binding, Process Default will do a Process Full on the affected object."
	},
	{
		"label": "defragment",
		"detail": "Creates or rebuilds indexes and aggregations for all processed partitions. For unprocessed objects, this option generates an error. Processing with this option is needed if you turn off Lazy Processing."
	}
];
