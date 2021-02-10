/* eslint-disable */
import { expect } from 'chai';
import * as childProcess from 'child_process';
import deepEqual = require('deep-equal');
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { DryCommandConfig } from './dry-command-config';
import { DryPackageContent } from './dry-package-content';
import { DryPackagerDescriptor } from './dry-packager-descriptor';
import { JsonUtils } from './json-utils';

describe('index', () => {
    const childProcessStdio = 'ignore';
    const dryIndexJs = path.resolve('dist/index.js');
    const testDir = path.resolve('dist-test');
    const yarnDescriptorFile = path.resolve('packagerDescriptorTemplates/yarn.json');
    const npmDescriptorFile = path.resolve('packagerDescriptorTemplates/npm.json');
    const pnpmDescriptorFile = path.resolve('packagerDescriptorTemplates/pnpm.json');

    const mkdirIfNotExist = (dir: string): void => {
        if (fs.existsSync(dir)) {
            return;
        }
        fsExtra.mkdirsSync(dir);
    };
    const readJson = (file: string): any => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const writeJson = (file: string, obj: any): any => fs.writeFileSync(path.resolve(file), JSON.stringify(obj, null, 2) + '\n');

    beforeEach(function (this: Mocha.IBeforeAndAfterContext) {
        this.timeout(10000);
        fsExtra.removeSync(testDir);
        mkdirIfNotExist(testDir);
        return;
    });

    describe('dry commands match commands', () => {
        const executeAndAssertSame = (
            packager: 'yarn' | 'npm' | 'pnpm' | undefined,
            commands: string[],
            packageJson: boolean,
            lock: boolean,
        ) => {
            const withNpmDir = path.resolve(`${testDir}/with-npm/foo`);
            mkdirIfNotExist(withNpmDir);
            const withDryDir = path.resolve(`${testDir}/with-dry/foo`);
            mkdirIfNotExist(withDryDir);
            commands.forEach((command) => childProcess.execSync(`npm ${command}`, { cwd: withNpmDir, stdio: childProcessStdio }));
            commands.forEach((command) =>
                childProcess.execSync(`node ${dryIndexJs} ${packager ? `--dry-packager ${packager}` : ''} ${command}`, {
                    cwd: withDryDir,
                    stdio: childProcessStdio,
                }),
            );

            if (packageJson) {
                expect(deepEqual(readJson(`${withDryDir}/package-dry.json`), readJson(`${withNpmDir}/package.json`))).to.be.true;
            }
            if (lock) {
                expect(deepEqual(readJson(`${withDryDir}/package-lock.json`), readJson(`${withNpmDir}/package-lock.json`))).to.be.true;
            }
        };

        describe('npm', () => {
            it('init -f', () => executeAndAssertSame('npm', ['init -f'], true, false)).timeout(30000);
            it('init -f && install', () => executeAndAssertSame('npm', ['init -f', 'install'], true, true)).timeout(30000);
            it('init -f && install && pack', () => executeAndAssertSame('npm', ['init -f', 'install', 'pack'], true, true)).timeout(30000);
        });
    });

    describe('dry inheritance', () => {
        describe('npm', () => {
            const packagerArg = '--dry-packager npm';

            it('inherits foo script when foo is defined in dry package parent', () => {
                // Build parent
                const parentProject = path.resolve(`${testDir}/parent`);
                mkdirIfNotExist(parentProject);
                childProcess.execSync(`node ${dryIndexJs} ${packagerArg} init -f`, { cwd: parentProject, stdio: childProcessStdio });
                const parentDryPackage = readJson(path.resolve(`${parentProject}/package-dry.json`));
                parentDryPackage.scripts.foo = 'npm help';
                writeJson(`${parentProject}/package-dry.json`, parentDryPackage);
                childProcess.execSync(`node ${dryIndexJs} ${packagerArg} pack`, { cwd: parentProject, stdio: childProcessStdio });

                // Build child
                const childProject = path.resolve(`${testDir}/child`);
                mkdirIfNotExist(childProject);
                childProcess.execSync(`node ${dryIndexJs} ${packagerArg} init -f`, { cwd: childProject, stdio: childProcessStdio });
                const childDryPackage: DryPackageContent = readJson(path.resolve(`${childProject}/package-dry.json`));
                childDryPackage.dry = {
                    extends: 'parent/package-dry.json',
                    dependencies: {
                        parent: 'file:../parent/parent-1.0.0.tgz',
                    },
                };
                writeJson(`${childProject}/package-dry.json`, childDryPackage);

                // Run the script
                childProcess.execSync(`node ${dryIndexJs} ${packagerArg} run foo`, { cwd: childProject, stdio: childProcessStdio });

                expect(fs.existsSync(`${childProject}/package.json`)).to.be.false;
            }).timeout(30000);
            it('inherits version for dependencies and devDependencies script when version is defined in dry package parent', () => {
                // Build parent
                const parentProject = path.resolve(`${testDir}/parent`);
                mkdirIfNotExist(parentProject);
                childProcess.execSync(`node ${dryIndexJs} ${packagerArg} init -f`, { cwd: parentProject, stdio: childProcessStdio });
                const parentDryPackage = readJson(path.resolve(`${parentProject}/package-dry.json`));

                parentDryPackage.dependencyManagement = {
                    dfirst: 'parentValue',
                    dsecond: 'parentValue',
                    ddfirst: 'parentValue',
                    ddsecond: 'parentValue',
                };

                writeJson(`${parentProject}/package-dry.json`, parentDryPackage);
                childProcess.execSync(`node ${dryIndexJs} ${packagerArg} pack`, { cwd: parentProject, stdio: childProcessStdio });

                // Build child
                const childProject = path.resolve(`${testDir}/child`);
                mkdirIfNotExist(childProject);
                childProcess.execSync(`node ${dryIndexJs} ${packagerArg} init -f`, { cwd: childProject, stdio: childProcessStdio });
                const childDryPackage: DryPackageContent = readJson(path.resolve(`${childProject}/package-dry.json`));
                childDryPackage.dry = {
                    extends: 'parent/package-dry.json',
                    dependencies: {
                        parent: 'file:../parent/parent-1.0.0.tgz',
                    },
                };

                const classicNpmPackage: any = childDryPackage;
                classicNpmPackage.dependencies = {
                    dfirst: 'managed',
                    dsecond: 'childValue',
                };
                classicNpmPackage.devDependencies = {
                    ddfirst: 'managed',
                    ddsecond: 'childValue',
                };

                writeJson(`${childProject}/package-dry.json`, classicNpmPackage);

                // Run the script
                childProcess.execSync(`node ${dryIndexJs} ${packagerArg} --dry-keep-package-json`, {
                    cwd: childProject,
                    stdio: childProcessStdio,
                });

                const packageJson: any = readJson(`${childProject}/package.json`);

                const dependencies = packageJson.dependencies;
                const devDependencies = packageJson.devDependencies;

                expect(dependencies.dfirst).to.be.equals('parentValue');
                expect(dependencies.dsecond).to.be.equals('childValue');
                expect(devDependencies.ddfirst).to.be.equals('parentValue');
                expect(devDependencies.ddsecond).to.be.equals('childValue');

                expect(fs.existsSync(`${childProject}/package.json`)).to.be.true;

                fs.unlinkSync(`${childProject}/package.json`);
                expect(fs.existsSync(`${childProject}/package.json`)).to.be.false;
            }).timeout(30000);
        });
    });

    describe('dry json config loading', () => {
        describe('yarn', () => {
            it('yarn packager arguments simple mapping without argument value', () => {
                const yarn: DryPackagerDescriptor = JsonUtils.loadObject(yarnDescriptorFile, DryPackagerDescriptor);

                const arg: string = '-dd';
                const argValue: string = undefined;
                const inArgs: string[] = [];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                yarn.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(1);
                expect(outArgs[0]).to.be.equals('--verbose');
                expect(outInstallParentArgs.length).to.be.equals(1);
                expect(outInstallParentArgs[0]).to.be.equals('--verbose');
            });
            it('yarn packager arguments simple mapping with argument', () => {
                const yarn: DryPackagerDescriptor = JsonUtils.loadObject(yarnDescriptorFile, DryPackagerDescriptor);

                const arg: string = '--loglevel';
                const argValue: string = 'trace';
                const inArgs: string[] = [];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                yarn.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(1);
                expect(outArgs[0]).to.be.equals('--verbose');
                expect(outInstallParentArgs.length).to.be.equals(1);
                expect(outInstallParentArgs[0]).to.be.equals('--verbose');
            });
            it('yarn packager arguments simple mapping without argument value extracted', () => {
                const yarn: DryPackagerDescriptor = JsonUtils.loadObject(yarnDescriptorFile, DryPackagerDescriptor);

                const arg: string = '--loglevel';
                const argValue: string = undefined;
                const inArgs: string[] = ['trace'];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                yarn.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(1);
                expect(outArgs[0]).to.be.equals('--verbose');
                expect(outInstallParentArgs.length).to.be.equals(1);
                expect(outInstallParentArgs[0]).to.be.equals('--verbose');
                expect(inArgs.length).to.be.equals(0);
            });
            it('packager definition loading', () => {
                const yarn: DryPackagerDescriptor = JsonUtils.loadObject(yarnDescriptorFile, DryPackagerDescriptor);
                expect(yarn.getPackageManager()).to.be.equals('yarn');
                expect(yarn.getMappedArguments().length).to.be.equals(3);
            });
            it('check dry command config mapping (implicit)', () => {
                const inArgs: string[] = ['init', '-f', '-D'];
                const cfg: DryCommandConfig = new DryCommandConfig(inArgs);
                const outArgs: string[] = cfg.getCommandProxyArgs();
                const outInstallParentArgs: string[] = cfg.getInstallParentCommandProxyArgs();

                expect(cfg.getPackagerDescriptor().getPackageManager()).to.be.equals('yarn');
                expect(outArgs.length).to.be.equals(3);
                expect(outArgs[0]).to.be.equals('init');
                expect(outArgs[1]).to.be.equals('-f');
                expect(outArgs[2]).to.be.equals('--verbose');
                expect(outInstallParentArgs.length).to.be.equals(1);
                expect(outInstallParentArgs[0]).to.be.equals('--verbose');
            });
            it('check dry command config mapping (explicit)', () => {
                const inArgs: string[] = ['--dry-packager', 'yarn', 'init', '-f', '-D'];
                const cfg: DryCommandConfig = new DryCommandConfig(inArgs);
                const outArgs: string[] = cfg.getCommandProxyArgs();
                const outInstallParentArgs: string[] = cfg.getInstallParentCommandProxyArgs();

                expect(cfg.getPackagerDescriptor().getPackageManager()).to.be.equals('yarn');
                expect(outArgs.length).to.be.equals(3);
                expect(outArgs[0]).to.be.equals('init');
                expect(outArgs[1]).to.be.equals('-f');
                expect(outArgs[2]).to.be.equals('--verbose');
                expect(outInstallParentArgs.length).to.be.equals(1);
                expect(outInstallParentArgs[0]).to.be.equals('--verbose');
            });
        });
        describe('npm', () => {
            it('npm packager arguments simple mapping without argument value', () => {
                const npm: DryPackagerDescriptor = JsonUtils.loadObject(npmDescriptorFile, DryPackagerDescriptor);

                const arg: string = '-dd';
                const argValue: string = undefined;
                const inArgs: string[] = [];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                npm.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(2);
                expect(outArgs[0]).to.be.equals('--loglevel');
                expect(outArgs[1]).to.be.equals('verbose');
                expect(outInstallParentArgs.length).to.be.equals(2);
                expect(outInstallParentArgs[0]).to.be.equals('--loglevel');
                expect(outInstallParentArgs[1]).to.be.equals('verbose');
            });
            it('npm packager arguments simple mapping with argument', () => {
                const npm: DryPackagerDescriptor = JsonUtils.loadObject(npmDescriptorFile, DryPackagerDescriptor);

                const arg: string = '--loglevel';
                const argValue: string = 'trace';
                const inArgs: string[] = [];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                npm.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(2);
                expect(outArgs[0]).to.be.equals('--loglevel');
                expect(outArgs[1]).to.be.equals('silly');
                expect(outInstallParentArgs.length).to.be.equals(2);
                expect(outInstallParentArgs[0]).to.be.equals('--loglevel');
                expect(outInstallParentArgs[1]).to.be.equals('silly');
            });
            it('npm packager arguments simple mapping without argument value extracted', () => {
                const npm: DryPackagerDescriptor = JsonUtils.loadObject(npmDescriptorFile, DryPackagerDescriptor);

                const arg: string = '--loglevel';
                const argValue: string = undefined;
                const inArgs: string[] = ['trace'];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                npm.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(2);
                expect(outArgs[0]).to.be.equals('--loglevel');
                expect(outArgs[1]).to.be.equals('silly');
                expect(outInstallParentArgs.length).to.be.equals(2);
                expect(outInstallParentArgs[0]).to.be.equals('--loglevel');
                expect(outInstallParentArgs[1]).to.be.equals('silly');
                expect(inArgs.length).to.be.equals(0);
            });
            it('packager definition loading', () => {
                const npm: DryPackagerDescriptor = JsonUtils.loadObject(npmDescriptorFile, DryPackagerDescriptor);
                expect(npm.getPackageManager()).to.be.equals('npm');
                expect(npm.getMappedArguments().length).to.be.equals(6);
            });
            it('check dry command config mapping', () => {
                const inArgs: string[] = ['--dry-packager', 'npm', 'init', '-f', '-D'];
                const cfg: DryCommandConfig = new DryCommandConfig(inArgs);
                const outArgs: string[] = cfg.getCommandProxyArgs();
                const outInstallParentArgs: string[] = cfg.getInstallParentCommandProxyArgs();

                expect(cfg.getPackagerDescriptor().getPackageManager()).to.be.equals('npm');
                expect(outArgs.length).to.be.equals(4);
                expect(outArgs[0]).to.be.equals('init');
                expect(outArgs[1]).to.be.equals('-f');
                expect(outArgs[2]).to.be.equals('--loglevel');
                expect(outArgs[3]).to.be.equals('info');
                expect(outInstallParentArgs.length).to.be.equals(2);
                expect(outInstallParentArgs[0]).to.be.equals('--loglevel');
                expect(outInstallParentArgs[1]).to.be.equals('info');
            });
        });
        describe('pnpm', () => {
            it('pnpm packager arguments simple mapping without argument value', () => {
                const pnpm: DryPackagerDescriptor = JsonUtils.loadObject(pnpmDescriptorFile, DryPackagerDescriptor);

                const arg: string = '-dd';
                const argValue: string = undefined;
                const inArgs: string[] = [];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                pnpm.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(2);
                expect(outArgs[0]).to.be.equals('--loglevel');
                expect(outArgs[1]).to.be.equals('verbose');
                expect(outInstallParentArgs.length).to.be.equals(2);
                expect(outInstallParentArgs[0]).to.be.equals('--loglevel');
                expect(outInstallParentArgs[1]).to.be.equals('verbose');
            });
            it('pnpm packager arguments simple mapping with argument', () => {
                const pnpm: DryPackagerDescriptor = JsonUtils.loadObject(pnpmDescriptorFile, DryPackagerDescriptor);

                const arg: string = '--loglevel';
                const argValue: string = 'trace';
                const inArgs: string[] = [];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                pnpm.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(2);
                expect(outArgs[0]).to.be.equals('--loglevel');
                expect(outArgs[1]).to.be.equals('silly');
                expect(outInstallParentArgs.length).to.be.equals(2);
                expect(outInstallParentArgs[0]).to.be.equals('--loglevel');
                expect(outInstallParentArgs[1]).to.be.equals('silly');
            });
            it('pnpm packager arguments simple mapping without argument value extracted', () => {
                const pnpm: DryPackagerDescriptor = JsonUtils.loadObject(pnpmDescriptorFile, DryPackagerDescriptor);

                const arg: string = '--loglevel';
                const argValue: string = undefined;
                const inArgs: string[] = ['trace'];
                const outArgs: string[] = [];
                const outInstallParentArgs: string[] = [];
                pnpm.mapArguments(arg, argValue, inArgs, outArgs, outInstallParentArgs);
                expect(outArgs.length).to.be.equals(2);
                expect(outArgs[0]).to.be.equals('--loglevel');
                expect(outArgs[1]).to.be.equals('silly');
                expect(outInstallParentArgs.length).to.be.equals(2);
                expect(outInstallParentArgs[0]).to.be.equals('--loglevel');
                expect(outInstallParentArgs[1]).to.be.equals('silly');
                expect(inArgs.length).to.be.equals(0);
            });
            it('packager definition loading', () => {
                const pnpm: DryPackagerDescriptor = JsonUtils.loadObject(pnpmDescriptorFile, DryPackagerDescriptor);
                expect(pnpm.getPackageManager()).to.be.equals('pnpm');
                expect(pnpm.getMappedArguments().length).to.be.equals(6);
            });
            it('check dry command config mapping', () => {
                const inArgs: string[] = ['--dry-packager', 'pnpm', 'init', '-f', '-D'];
                const cfg: DryCommandConfig = new DryCommandConfig(inArgs);
                const outArgs: string[] = cfg.getCommandProxyArgs();
                const outInstallParentArgs: string[] = cfg.getInstallParentCommandProxyArgs();

                expect(cfg.getPackagerDescriptor().getPackageManager()).to.be.equals('pnpm');
                expect(outArgs.length).to.be.equals(4);
                expect(outArgs[0]).to.be.equals('init');
                expect(outArgs[1]).to.be.equals('-f');
                expect(outArgs[2]).to.be.equals('--loglevel');
                expect(outArgs[3]).to.be.equals('info');
                expect(outInstallParentArgs.length).to.be.equals(2);
                expect(outInstallParentArgs[0]).to.be.equals('--loglevel');
                expect(outInstallParentArgs[1]).to.be.equals('info');
            });
        });
    });
});
