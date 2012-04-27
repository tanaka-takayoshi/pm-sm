
const ASSERT = require("assert");
const PATH = require("path");
const FS = require("fs");
const EXEC = require("child_process").exec;
const Q = require("sourcemint-util-js/lib/q");
const PACKAGES = require("sourcemint-pinf-js/lib/packages");
const PM = require("../pm");
const NPM = require("sourcemint-pm-npm/lib/npm");


exports.main = function(pm, options) {
    var self = this;

    ASSERT(typeof pm.context.program !== "undefined", "'context.program' required!");
    ASSERT(typeof pm.context.package === "undefined", "'context.package' may not be set!");

    return PACKAGES.loadDependenciesForProgram(pm.context.program).then(function() {

        var done = Q.ref();
        // NOTE: By default we expect a NPM-compatible package unless otherwise specified.
        var pmDeclaration = pm.context.program.package.descriptor.pm;
        if (typeof pmDeclaration === "undefined" || pmDeclaration === "npm") {
            done = Q.when(done, function() {
                var opts = {
                    env: {
                        "SM_CLI_CALL": "true"
                    }
                };
                if (options.update === true) {
                    return NPM.update(pm.context.program.package.path, opts);
                } else {
                    return NPM.install(pm.context.program.package.path, ".", opts);
                }
            });
        }

        return done.then(function() {
            return pm.context.program.walkPackages({}, function(parentPkg, pkgInfo, pkgContext) {
                
                if (pkgContext.circular === true) return;

                function walkMappings() {
                    var mapping = false;

                    if (pkgInfo[1].indexOf("mappings") >= 0) {
                        mapping = parentPkg.descriptor.json.mappings[pkgInfo[2][0]];
                    }
                    else if (pkgInfo[1].indexOf("devMappings") >= 0) {
                        mapping = parentPkg.descriptor.json.devMappings[pkgInfo[2][0]];
                    }

                    if (!mapping) {
                        return;
                    }
                        
                    if (mapping === ".") {
                            
    throw new Error("NYI - Mapping to self!");                        
                        
                    } else {

                        return PM.forPackagePath(pkgInfo[0].path, pm).then(function(pm) {
                            
                            var handler = require("sourcemint-pm-" + mapping[0] + "/lib/pm");
    
                            var args = {
                                locator: mapping[1],
                                name: PATH.basename(pm.context.package.path)
                            };
    
                            function makePath() {
                                if (typeof handler.path === "function") {
                                    return handler.path(pm);
                                } else {
                                    return Q.call(function() {
                                        return pm.context.package.path;
                                    });
                                }
                            }
                            
                            return makePath().then(function(path) {

                                var deferred = Q.defer();

                                function install() {

                                    Q.when(handler[(options.update === true)?"update":"install"](pm, args), function() {
                                        
                                        if (!PATH.existsSync(PATH.join(path, ".sourcemint"))) {
                                            FS.mkdirSync(PATH.join(path, ".sourcemint"), 0755);
                                        }
                                        FS.writeFile(PATH.join(path, ".sourcemint", "source.json"), JSON.stringify({
                                            url: args.locator,
                                            nodeVersion: process.version,
                                            time: pm.context.time
                                        }), function(err) {
                                            if (err) {
                                                deferred.reject(err);
                                                return;
                                            }
                                            deferred.resolve(true);
                                        });
                                    }, deferred.reject);
                                }
                                
                                if (options.update === true) {
                                    install();
                                } else {
                                    PATH.exists(PATH.join(path, ".sourcemint", "source.json"), function(exists) {
                                        if (exists) {
                                            // Already exists.
                                            FS.readFile(PATH.join(path, ".sourcemint", "source.json"), function(err, data) {
                                                if (err) {
                                                    deferred.reject(err);
                                                    return;
                                                }
                                                var sourceInfo = JSON.parse(data);
                                                if (sourceInfo.url === args.locator && sourceInfo.nodeVersion === process.version) {
                                                    // No change.
                                                    // TODO: Send HEAD to ensure data at URL has not changed.
                                                    deferred.resolve();
                                                    return;
                                                }
                                                install();
                                            });
                                            return;
                                        }
                                        install();
                                    });
                                }
    
                                return deferred.promise;
                            });
                        });                     
                    }
                }
                
                function walkDependencies() {
                    var dependency = false;

                    if (pkgInfo[1].indexOf("dependencies") >= 0) {
                        dependency = parentPkg.descriptor.json.dependencies[pkgInfo[2][0]];
                    }
                    else if (pkgInfo[1].indexOf("devDependencies") >= 0) {
                        dependency = parentPkg.descriptor.json.devDependencies[pkgInfo[2][0]];
                    }

                    if (!dependency) {
                        return;
                    }

//console.log(pkgInfo[2][0], dependency, pkgInfo[0].path);

                }
                
                return Q.when(walkMappings(), function() {
                    return Q.when(walkDependencies());
                })
            });
        });
    }); 
}