'use strict';

import {
    window, ExtensionContext,
    Disposable, extensions,
    commands, Uri, workspace,
    StatusBarAlignment, StatusBarItem,
} from 'vscode';

import {GitExtension, API} from './git';


export function activate(context: ExtensionContext) {
    const _gitExtension = extensions.getExtension<GitExtension>('vscode.git');
    if (_gitExtension) {
        const git = _gitExtension.exports.getAPI(1);
        let jiraLink = new JiraLink(context, git);
        let controller = new JiraLinkController(jiraLink, git);

        context.subscriptions.push(jiraLink);
        context.subscriptions.push(controller);
    }
}

class JiraLinkController {
    private _jiraLink: JiraLink;
    private _disposable: Disposable;

    constructor(jiraLink: JiraLink, git: API) {
        this._jiraLink = jiraLink;

        let subscriptions: Disposable[] = [];
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);
        git.onDidOpenRepository(this._onEvent, this, subscriptions);

        this._jiraLink.update();

        this._disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable.dispose();
    }

    private _onEvent() {
        this._jiraLink.update();
    }
}

class JiraLink {
    private _statusBarItem: StatusBarItem =  window.createStatusBarItem(StatusBarAlignment.Left);
    private _jiraregex: RegExp = RegExp(".*([A-Z0-9]+-[0-9]+).*");
    private _git : API;

    constructor(context: ExtensionContext, git: API) {
        this._git = git;
        this._statusBarItem.command = 'extension.openJiraIssue';
        context.subscriptions.push(commands.registerCommand('extension.openJiraIssue', () => {
            this.openJira();
        }));
    }

    private async openJira() {
        let url = await this.getUrl();
        if (url) {
            commands.executeCommand('vscode.open', Uri.parse(url));
        }
    }

    private async getUrl() {
        const { instanceUrl } = workspace.getConfiguration('jiraLink');

        if (!instanceUrl) {
            window.showErrorMessage("You need to configure your JIRA instance url in the settings.");
            return null;
        }

        let issue = await this.getIssue();
        if (issue) {
            return instanceUrl + '/browse/' + issue;
        }
    }

    private async getIssue() {
        let branch = await this.getBranch();
        if (branch) {
            let search = this._jiraregex.exec(branch);
            if (search) {
                return search[1];
            }
        }

        return null;
    }

    private async getBranch() {
        const repositories = this._git.repositories;
        if (repositories.length) {
            let branch = await repositories[0].getBranch('HEAD');
            return branch.name;
        }

        return null;
    }

    public async update() {
        let editor = window.activeTextEditor;
        if (!editor) {
            this._statusBarItem.hide();
            return;
        }
        let issue = await this.getIssue();
        if (issue) {
            this._statusBarItem.text = "JIRA: " + issue;
            this._statusBarItem.show();
        }
        else {
            this._statusBarItem.hide();
        }
    }

    dispose() {
        this._statusBarItem.dispose();
    }
}
