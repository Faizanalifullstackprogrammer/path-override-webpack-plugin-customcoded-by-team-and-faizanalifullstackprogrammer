
import * as fs from "fs";
import * as path from "path";

import * as webpack from "webpack";

const WIN = process.platform.startsWith("win");

const COMPONENT_ID_PATTERN = WIN ? /([^\\]+)$/ : /[^/]*$/;

interface IFileExtensionData {
    ext: string;
    file: boolean;
}

const getResolvedFile = (
    filePath: string,
    exts: string[],
    callback: (result: string|boolean) => void) => {

    const enclosingDirPath = filePath || "";
    const captured = enclosingDirPath.match(COMPONENT_ID_PATTERN);

    if (captured) {
        const componentId = captured[1];
        const extObjs: IFileExtensionData[] = exts.reduce((allExts: IFileExtensionData[], ext: string) => {
            allExts.push({ ext, file: true }, { ext, file: false });
            return allExts;
        }, []);

        const tryToFindExtension = (index: number) => {
            const extObj = extObjs[index];
            if (extObj === undefined) {
                return callback(false);
            }
            let componentFileName: string;
            let componentFilePath: string;
            if (extObj.file) {
                componentFilePath = enclosingDirPath;
                const extension = "." + extObj.ext;
                if (!componentFilePath.endsWith(extension)) {
                    componentFilePath += extension;
                }
            } else {
                componentFileName = componentId + "." + extObj.ext;
                componentFilePath = path.join(enclosingDirPath, componentFileName);
            }
            fs.stat(componentFilePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    return tryToFindExtension(index + 1);
                }
                callback(componentFilePath);
            });
        };

        tryToFindExtension(0);
    }
};

export default class {

    public constructor(
        private pathRegExp: RegExp,
        private pathReplacement: string,
        private exts: string[] = ["jsx", "js", "scss", "css"],
        private reExcludeContexts: RegExp[] = [],
        private logFn: (msg: string) => void = (): void => { /* noop */ }) {
    }

    public apply(resolver: webpack.Compiler): void {

        const pathRegExp = this.pathRegExp;
        const pathReplacement = this.pathReplacement;
        const exts = this.exts;

        resolver.hooks.normalModuleFactory.tap("path-override", (req) => {

            req.hooks.beforeResolve.tapAsync("path-override", (data, callback) => {
                if (data === undefined) {
                    return callback(null);
                }
                for (const reExcludeContext of this.reExcludeContexts) {
                    if (reExcludeContext.exec(data.context)) {
                        return callback(null);
                    }
                }
                if (pathRegExp.test(data.request)) {
                    const filePath = data.request.replace(pathRegExp, pathReplacement);
                    getResolvedFile(filePath, exts, (file) => {
                        if (typeof file === "string") {
                            this.logFn(`[path-override] (${data.context}) ${data.request} => ${file}`);
                            data.request = file;
                        }
                        return callback(null);
                    });
                } else {
                    return callback(null);
                }
            });
        });
    }
}
