import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "crud-generator" is now active!');

    const disposable = vscode.commands.registerCommand('crud-generator.generateCRUD', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        const newFormatRegex = /^\s*table_name\s*\(\s*"(\w+)"\s*\)\s*;/i;
        if (!newFormatRegex.test(text)) {
            vscode.window.showErrorMessage('Selected text does not match the expected format.');
            return;
        }
        const { tableName, columns, primaryKey } = parseNewFormat(text);
        if (!tableName || columns.length === 0) {
            vscode.window.showErrorMessage('Failed to parse the table schema.');
            return;
        }
        const { specCode, bodyCode } = generateCRUD(tableName, columns, primaryKey);
        const fullText = editor.document.getText();
        const updatedText = fullText.replace(text, `${text}\n\n${specCode}\n\n${bodyCode}`);
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(fullText.length)
        );
        editor.edit(editBuilder => {
            editBuilder.replace(fullRange, updatedText);
        }).then(() => {
            vscode.window.showInformationMessage(`CRUD operations for ${tableName} generated and updated successfully.`);
        });
    });

    context.subscriptions.push(disposable);
}

function parseNewFormat(text: string) {
    const tableNameRegex = /table_name\s*\(\s*"(\w+)"\s*\)\s*;/i;
    const columnRegex = /table_attr\s*\(\s*"(\w+)"\s*\)\s*(?:\.primarykey\s*)?;/ig;

    const tableNameMatch = text.match(tableNameRegex);
    const tableName = tableNameMatch ? tableNameMatch[1] : '';

    const columns: { name: string, primaryKey: boolean }[] = [];
    let primaryKey = '';
    let match;
    while ((match = columnRegex.exec(text)) !== null) {
        const columnName = match[1];
        const isPrimaryKey = /\.primarykey\s*;/.test(match[0]);
        columns.push({ name: columnName, primaryKey: isPrimaryKey });
        if (isPrimaryKey) {
            primaryKey = columnName;
        }
    }

    return { tableName, columns, primaryKey };
}

function generateCRUD(tableName: string, columns: { name: string, primaryKey: boolean }[], primaryKey: string) {
    let specCode = `CREATE OR REPLACE PACKAGE ${tableName}_package IS\n`;

    specCode += `  PROCEDURE create_${tableName}(\n`;
    columns.forEach((column, index) => {
        if (!column.primaryKey) {
            specCode += `    c_${column.name} IN ${tableName}.${column.name}%TYPE`;
            if (index < columns.length - 1) {
                specCode += ',\n';
            } else {
                specCode += '\n';
            }
        }
    });
    specCode += `  );\n\n`;

    specCode += `  PROCEDURE update_${tableName}(\n`;
    specCode += `    u_${primaryKey} IN ${tableName}.${primaryKey}%TYPE`;
    columns.forEach(column => {
        if (!column.primaryKey) {
            specCode += `,\n    u_${column.name} IN ${tableName}.${column.name}%TYPE`;
        }
    });
    specCode += `\n  );\n\n`;

    specCode += `  PROCEDURE delete_${tableName}(\n`;
    specCode += `    d_${primaryKey} IN ${tableName}.${primaryKey}%TYPE\n`;
    specCode += `  );\n\n`;

    specCode += `  PROCEDURE gid_${tableName}_by_id(\n`;
    specCode += `    gid_${primaryKey} IN ${tableName}.${primaryKey}%TYPE\n`;
    specCode += `  );\n\n`;

    specCode += `  PROCEDURE get_all_${tableName};\n\n`;

    specCode += `END ${tableName}_package;\n`;

    let bodyCode = `CREATE OR REPLACE PACKAGE BODY ${tableName}_package IS\n`;

    bodyCode += `  PROCEDURE create_${tableName}(\n`;
    columns.forEach((column, index) => {
        if (!column.primaryKey) {
            bodyCode += `    c_${column.name} IN ${tableName}.${column.name}%TYPE`;
            if (index < columns.length - 1) {
                bodyCode += ',\n';
            } else {
                bodyCode += '\n';
            }
        }
    });
    bodyCode += `  ) IS\n  BEGIN\n`;
    bodyCode += `    INSERT INTO ${tableName} (${columns.filter(col => !col.primaryKey).map(col => col.name).join(', ')})\n`;
    bodyCode += `    VALUES (${columns.filter(col => !col.primaryKey).map(col => `c_${col.name}`).join(', ')});\n`;
    bodyCode += `    COMMIT;\n`;
    bodyCode += `  END create_${tableName};\n\n`;

    bodyCode += `  PROCEDURE update_${tableName}(\n`;
    bodyCode += `    u_${primaryKey} IN ${tableName}.${primaryKey}%TYPE`;
    columns.forEach(column => {
        if (!column.primaryKey) {
            bodyCode += `,\n    u_${column.name} IN ${tableName}.${column.name}%TYPE`;
        }
    });
    bodyCode += `\n  ) IS\n  BEGIN\n`;
    bodyCode += `    UPDATE ${tableName} SET\n`;
    bodyCode += `      ${columns.filter(col => !col.primaryKey).map(col => `${col.name} = u_${col.name}`).join(',\n      ')}\n`;
    bodyCode += `    WHERE ${primaryKey} = u_${primaryKey};\n`;
    bodyCode += `    COMMIT;\n`;
    bodyCode += `  END update_${tableName};\n\n`;

    bodyCode += `  PROCEDURE delete_${tableName}(\n`;
    bodyCode += `    d_${primaryKey} IN ${tableName}.${primaryKey}%TYPE\n`;
    bodyCode += `  ) IS\n  BEGIN\n`;
    bodyCode += `    DELETE FROM ${tableName} WHERE ${primaryKey} = d_${primaryKey};\n`;
    bodyCode += `    COMMIT;\n`;
    bodyCode += `  END delete_${tableName};\n\n`;

    bodyCode += `  PROCEDURE gid_${tableName}_by_id(\n`;
    bodyCode += `    gid_${primaryKey} IN ${tableName}.${primaryKey}%TYPE\n`;
    bodyCode += `  ) IS\n    c_gid SYS_REFCURSOR;\n  BEGIN\n`;
    bodyCode += `    OPEN c_gid FOR SELECT * FROM ${tableName} WHERE ${primaryKey} = gid_${primaryKey};\n`;
    bodyCode += `    DBMS_SQL.RETURN_RESULT(c_gid);\n`;
    bodyCode += `  END gid_${tableName}_by_id;\n\n`;

    bodyCode += `  PROCEDURE get_all_${tableName} IS\n    c_g_all SYS_REFCURSOR;\n  BEGIN\n`;
    bodyCode += `    OPEN c_g_all FOR SELECT * FROM ${tableName};\n`;
    bodyCode += `    DBMS_SQL.RETURN_RESULT(c_g_all);\n`;
    bodyCode += `  END get_all_${tableName};\n\n`;

    bodyCode += `END ${tableName}_package;\n`;

    return { specCode, bodyCode };
}

export function deactivate() {}
