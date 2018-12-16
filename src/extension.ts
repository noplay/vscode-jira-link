'use strict';

import {
    window, ExtensionContext,
    Disposable, extensions,
    commands, Uri, workspace,
    StatusBarAlignment, StatusBarItem, TextEditor, ConfigurationChangeEvent,
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
        git.onDidOpenRepository((repository) => {
            repository.state.onDidChange(this._onEvent, this, subscriptions);
            this._jiraLink.update();
        }, this, subscriptions);
        for (let repository of git.repositories) {
            repository.state.onDidChange(this._onEvent, this, subscriptions);
        }

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
    private _jiraregex: RegExp;
    private _git : API;

    constructor(context: ExtensionContext, git: API) {
        let subscriptions: Disposable[] = [];

        const { ticketRegexp } = workspace.getConfiguration('jiraLink');
        this._jiraregex = RegExp(ticketRegexp);
        this._git = git;

        workspace.onDidChangeConfiguration(this.updateSettings, this, subscriptions);
        this._statusBarItem.command = 'extension.openJiraIssue';
        context.subscriptions.push(commands.registerCommand('extension.openJiraIssue', () => {
            this.openJira();
        }));
    }
    private updateSettings(event: ConfigurationChangeEvent) {
        console.log("Settings");
        if (event.affectsConfiguration('jiraLink')) {
            const { ticketRegexp } = workspace.getConfiguration('jiraLink');
            this._jiraregex = RegExp(ticketRegexp);
        }
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

        return instanceUrl + '/browse/' + this._statusBarItem.tooltip;
    }

    private async getIssue(editor: TextEditor) {
        let branch = await this.getBranch(editor);
        if (branch) {
            let search = this._jiraregex.exec(branch);
            if (search) {
                return search[1];
            }
        }

        return null;
    }

    private async getBranch(editor: TextEditor) {
        const repositories = this._git.repositories;
        for (let repository of repositories) {
            let path = editor.document.uri.toString();
            if (path.startsWith(repository.rootUri.toString())) {
                let branch = await repository.getBranch('HEAD');
                return branch.name;
            }
        }

        return null;
    }

    public async update() {
        let editor = window.activeTextEditor;
        if (!editor) {
            this._statusBarItem.hide();
            return;
        }
        let issue = await this.getIssue(editor);
        if (issue) {
            this._statusBarItem.text = "JIRA: " + issue;
            this._statusBarItem.tooltip = issue; // Use to create the link when user click
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
