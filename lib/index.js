(function() {
  var CleanCSS, EOL, PluginError, Q, Terser, Vinyl, _, amdBundler, coffee, compile, compileAmd, compileBabel, compileCoffee, compileCss, compileExtendFile, compileJs, compileLess, compileSass, compileTs, cssBase64img, cssSprite, envifyReplace, extend, extendCache, fs, getDefaultValue, getParams, getProperty, gulpCssSprite, htmlBase64img, interpolateTemplate, less, minifyCSS, minifyJS, path, replaceProperties, resolveFilePath, safeAccess, sass, sus, through, ts;

  _ = require('lodash');

  Q = require('q');

  fs = require('fs');

  path = require('path');

  less = require('gulp-less');

  sass = require('gulp-sass')(require('sass'));

  Vinyl = require('vinyl');

  PluginError = require('plugin-error');

  through = require('through2');

  coffee = require('gulp-coffee');

  amdBundler = require('@mlz/gulp-amd-bundler');

  sus = require('gulp-sus');

  gulpCssSprite = require('gulp-img-css-sprite');

  CleanCSS = require('clean-css');

  ts = require('typescript');

  Terser = require('terser');

  envifyReplace = require('loose-envify/replace');

  EOL = '\n';

  getDefaultValue = function(defaultValue) {
    if (typeof defaultValue === 'function') {
      return defaultValue();
    }
    return defaultValue;
  };

  safeAccess = function(obj, props, defaultValue, canBeNull) {
    var i, j, k, len1, propsArr;
    if (!obj) {
      return getDefaultValue(defaultValue);
    }
    if (typeof obj[props] !== 'undefined') {
      if (obj[props] === null && !canBeNull) {
        return getDefaultValue(defaultValue);
      }
      return obj[props];
    }
    props = props.replace(/\[(\w+)\]/g, '.$1');
    props = props.replace(/^\./, '');
    propsArr = props.split('.');
    for (i = j = 0, len1 = propsArr.length; j < len1; i = ++j) {
      k = propsArr[i];
      if (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, k) && (obj[k] !== null || canBeNull)) {
        obj = obj[k];
      } else {
        return getDefaultValue(defaultValue);
      }
    }
    return obj;
  };

  interpolateTemplate = function(tpl, data, opt = {}) {
    if (!opt.open || !opt.close) {
      opt.open = '{{';
      opt.close = '}}';
    }
    if (opt.open === opt.close) {
      throw new Error('gulp-html-optimizer: open tag and close tag must not be same!');
    }
    return tpl.split(opt.open).map(function(part, i) {
      var _getDefaultValue, item, len, parts;
      if (i === 0) {
        return part;
      }
      parts = part.split(opt.close);
      len = parts.length;
      item = '';
      _getDefaultValue = function() {
        if (typeof opt.defaultValue === 'function') {
          return opt.defaultValue(item.trim());
        } else if (typeof opt.defaultValue !== 'undefined') {
          return String(opt.defaultValue);
        } else {
          return opt.open + item + opt.close;
        }
      };
      if (len === 1) {
        return opt.open + part;
      } else if (len === 2) {
        item = parts[0];
        return safeAccess(data, item.trim(), _getDefaultValue) + parts[1];
      } else {
        item = parts.shift();
        return safeAccess(data, item.trim(), _getDefaultValue) + parts.join(opt.close);
      }
    }).join('');
  };

  minifyJS = async function(content, file, opt) {
    var error, res;
    content = content.toString();
    if (opt.minifyJS) {
      try {
        res = (await Terser.minify(content, _.extend({}, opt.minifyJS)));
        content = res.code;
        content;
      } catch (error1) {
        error = error1;
        res.error.filename = file.path;
        console.log(error);
        throw new PluginError('gulp-html-optimizer', 'minifyJS error with file: ' + file.path);
      }
    }
    return content;
  };

  minifyCSS = function(content, file, opt) {
    var res;
    content = content.toString();
    if (opt.minifyCSS) {
      res = new CleanCSS(_.extend({}, opt.minifyCSS)).minify(content);
      if (res.errors && res.errors.length) {
        console.log(res.errors);
        throw new PluginError('gulp-html-optimizer', 'minifyCSS error with file: ' + file.path);
      }
      content = res.styles;
    }
    return content;
  };

  htmlBase64img = function(data, base, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.generateDataUri) {
        data = data.replace(/<img\s([^>]*)src="([^"]+)"/ig, function(full, extra, imgPath) {
          if (!/^data:|\/\//i.test(imgPath)) {
            imgPath = path.resolve(base, imgPath);
            if (fs.existsSync(imgPath)) {
              return '<img ' + extra + 'src="data:image/' + path.extname(imgPath).replace(/^\./, '') + ';base64,' + fs.readFileSync(imgPath, 'base64') + '"';
            } else {
              return full;
            }
          } else {
            return full;
          }
        });
        return resolve(data);
      } else {
        return resolve(data);
      }
    });
  };

  cssBase64img = function(content, filePath, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.generateDataUri) {
        return sus.cssContent(content, filePath).then(function(content) {
          return resolve(content);
        }, function(err) {
          return reject(err);
        }).done();
      } else {
        return resolve(content);
      }
    });
  };

  cssSprite = function(content, filePath, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.cssSprite) {
        return gulpCssSprite.cssContent(content, filePath, opt.cssSprite).then(function(content) {
          return resolve(content);
        }, function(err) {
          return reject(err);
        }).done();
      } else {
        return resolve(content);
      }
    });
  };

  compileLess = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var lessStream, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      lessStream = less(opt.lessOpt);
      lessStream.pipe(through.obj(function(file, enc, next) {
        return Q.Promise(function(resolve, reject) {
          if (opt.postcss) {
            return opt.postcss(file, 'css').then(function(file) {
              return resolve({
                css: file.contents.toString()
              });
            }, reject);
          } else {
            return resolve({
              css: file.contents.toString()
            });
          }
        }).then(function(res) {
          var content;
          content = res.css;
          return cssSprite(content, file.path, opt).then(function(content) {
            return cssBase64img(content, file.path, opt);
          }).then(function(content) {
            file.contents = Buffer.from([trace + '<style>', minifyCSS(content, file, opt), '</style>'].join(EOL));
            resolve(file);
            return next();
          }, function(err) {
            return reject(err);
          }).done();
        }, function(err) {
          return reject(err);
        });
      }));
      lessStream.on('error', function(e) {
        console.log('gulp-html-optimizer Error:', e.message);
        console.log('file:', file.path);
        return console.log('line:', e.line);
      });
      return lessStream.end(file);
    });
  };

  compileSass = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var sassStream, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      sassStream = sass(opt.sassOpt);
      sassStream.on('data', function(file) {
        return Q.Promise(function(resolve, reject) {
          if (opt.postcss) {
            return opt.postcss(file, 'css').then(function(file) {
              return resolve({
                css: file.contents.toString()
              });
            }, reject);
          } else {
            return resolve({
              css: file.contents.toString()
            });
          }
        }).then(function(res) {
          var content;
          content = res.css;
          return cssSprite(content, file.path, opt).then(function(content) {
            return cssBase64img(content, file.path, opt);
          }).then(function(content) {
            file.contents = Buffer.from([trace + '<style>', minifyCSS(content, file, opt), '</style>'].join(EOL));
            return resolve(file);
          }, function(err) {
            return reject(err);
          }).done();
        }, function(err) {
          return reject(err);
        });
      });
      sassStream.on('error', function(e) {
        console.log('gulp-html-optimizer Error:', e.message);
        return console.log('file:', file.path);
      });
      return sassStream.write(file);
    });
  };

  compileCss = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      return Q.Promise(function(resolve, reject) {
        if (opt.postcss) {
          return opt.postcss(file, 'css').then(function(file) {
            return resolve({
              css: file.contents.toString()
            });
          }, reject);
        } else {
          return resolve({
            css: file.contents.toString()
          });
        }
      }).then(function(res) {
        var content;
        content = res.css;
        return cssSprite(content, file.path, opt).then(function(content) {
          return cssBase64img(content, file.path, opt);
        }).then(function(content) {
          file.contents = Buffer.from([trace + '<style>', minifyCSS(content, file, opt), '</style>'].join(EOL));
          return resolve(file);
        }, function(err) {
          return reject(err);
        }).done();
      }, function(err) {
        return reject(err);
      });
    });
  };

  compileCoffee = function(file, plainId, opt) {
    return Q.Promise(function(resolve, reject) {
      var coffeeStream, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      coffeeStream = coffee(opt.coffeeOpt);
      coffeeStream.pipe(through.obj(async function(file, enc, next) {
        var content;
        content = file.contents.toString();
        if (opt.envify) {
          content = envifyReplace(content, [opt.envify.env || process.env]);
        }
        file.contents = Buffer.from([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script>', (await minifyJS(content, file, opt)), '</script>'].join(EOL));
        resolve(file);
        return next();
      }));
      coffeeStream.on('error', function(e) {
        console.log('gulp-html-optimizer Error:', e.message);
        console.log('file:', file.path);
        return console.log(e.stack);
      });
      return coffeeStream.end(file);
    });
  };

  compileJs = function(file, plainId, opt) {
    return Q.Promise(async function(resolve, reject) {
      var content, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      if (opt.babel) {
        return opt.babel(file).then(async function(file) {
          var content;
          content = file.contents.toString();
          if (opt.envify) {
            content = envifyReplace(content, [opt.envify.env || process.env]);
          }
          file.contents = Buffer.from([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script>', (await minifyJS(content, file, opt)), '</script>'].join(EOL));
          return resolve(file);
        }, reject);
      } else {
        content = file.contents.toString();
        if (opt.envify) {
          content = envifyReplace(content, [opt.envify.env || process.env]);
        }
        file.contents = Buffer.from([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script>', (await minifyJS(content, file, opt)), '</script>'].join(EOL));
        return resolve(file);
      }
    });
  };

  compileTs = function(file, plainId, opt) {
    return Q.Promise(async function(resolve, reject) {
      var content, trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      content = ts.transpileModule(file.contents.toString(), {
        compilerOptions: opt.tsCompilerOptions || {
          target: ts.ScriptTarget.ES5
        }
      });
      content = content.outputText;
      if (opt.envify) {
        content = envifyReplace(content, [opt.envify.env || process.env]);
      }
      file.contents = Buffer.from([plainId ? trace + '<script type="text/html" id="' + plainId + '">' : trace + '<script>', (await minifyJS(content, file, opt)), '</script>'].join(EOL));
      return resolve(file);
    });
  };

  compileBabel = function(file, attrLeft, attrRight, opt) {
    return Q.Promise(function(resolve, reject) {
      return opt.babel(file).then(async function(file) {
        var content;
        if (attrLeft) {
          attrLeft = ' ' + attrLeft;
        }
        if (attrRight) {
          attrRight = ' ' + attrRight;
        }
        content = file.contents.toString();
        if (opt.envify) {
          content = envifyReplace(content, [opt.envify.env || process.env]);
        }
        file.contents = Buffer.from(['<script' + attrLeft + attrRight + '>', (await minifyJS(content, file, opt)), '</script>'].join(EOL));
        return resolve(file);
      }, reject);
    });
  };

  compileAmd = function(file, baseFile, baseDir, params, opt) {
    return Q.Promise(function(resolve, reject) {
      var trace;
      if (opt.trace) {
        trace = '<!-- trace:' + path.relative(process.cwd(), file.path) + ' -->' + EOL;
      } else {
        trace = '';
      }
      return amdBundler.bundle(file, {
        baseFile: baseFile,
        baseDir: baseDir,
        inline: true,
        postcss: opt.postcss,
        generateDataUri: opt.generateDataUri,
        cssSprite: opt.cssSprite,
        beautifyTemplate: opt.beautifyTemplate,
        strictModeTemplate: opt.strictModeTemplate,
        dataInjectionTemplate: opt.dataInjectionTemplate,
        conservativeCollapseTemplate: opt.conservativeCollapseTemplate,
        babel: opt.babel,
        trace: opt.trace,
        markedOptions: opt.markedOptions,
        isRelativeDependency: opt.isRelativeDependency,
        cssModuleClassNameGenerator: opt.cssModuleClassNameGenerator,
        cssModuleClassNamePlaceholder: opt.cssModuleClassNamePlaceholder,
        useExternalCssModuleHelper: opt.useExternalCssModuleHelper
      }).then(async function(file) {
        var content, define, err, exp, factory, mod, outPath, processDefQueue, src;
        content = file.contents.toString();
        if (opt.envify) {
          content = envifyReplace(content, [opt.envify.env || process.env]);
        }
        if (params.render) {
          define = function(id, deps, factory) {
            return factory;
          };
          factory = null;
          try {
            eval('factory = ' + content.replace(/[\s\S]*\bdefine\(/, 'define('));
          } catch (error1) {
            err = error1;
            console.log(file.path);
            throw err;
          }
          exp = {};
          mod = {};
          factory(function() {}, exp, mod);
          if (/\.tpl\.html\.js$/.test(file.path)) {
            file.contents = Buffer.from(trace + exp.render(params));
          } else if (/\.md\.js$/.test(file.path)) {
            file.contents = Buffer.from(trace + interpolateTemplate(mod.exports, params, opt.interpolate));
          } else {
            throw new PluginError('gulp-html-optimizer', 'Unsupported inline render file type: ' + file.path);
          }
        } else {
          if (params.process === 'yes') {
            if (baseDir || /\brequire-plugin\b/.test(file.path)) {
              processDefQueue = 'require.processDefQueue();';
            } else {
              processDefQueue = 'require.processDefQueue(\'\', require.PAGE_BASE_URL, require.getBaseUrlConfig(require.PAGE_BASE_URL));';
            }
          } else {
            processDefQueue = '';
          }
          if (params.inline === 'yes') {
            file.contents = Buffer.from([params.plainId ? trace + '<script type="text/html" id="' + params.plainId + '">' : trace + '<script>', (await minifyJS(content + EOL + processDefQueue, file, opt)), '</script>'].join(EOL));
          } else {
            if (params.out) {
              outPath = path.resolve(path.dirname(baseFile.path), params.out);
            } else {
              outPath = file.path.slice(0, file.path.lastIndexOf(path.extname(file.path))) + '.js';
            }
            src = params.src;
            if (!src) {
              src = path.relative(baseDir || path.dirname(baseFile.path), file.path);
            }
            if (baseDir && src.indexOf('.') !== 0) {
              src = '/' + src;
            }
            if (!processDefQueue || content.slice(-processDefQueue.length) === processDefQueue) {
              fs.writeFileSync(outPath, content);
            } else {
              fs.writeFileSync(outPath, [content, processDefQueue].join(EOL));
            }
            file.contents = Buffer.from(trace + '<script src="' + src + '"></script>');
          }
        }
        return resolve(file);
      }, function(err) {
        return reject(err);
      }).done();
    });
  };

  getParams = function(params, file) {
    var e, m, r, res;
    params = params.trim();
    if (params.indexOf('{') === 0) {
      try {
        res = JSON.parse(params);
        return res;
      } catch (error1) {
        e = error1;
        console.log(e);
        throw new PluginError('gulp-html-optimizer', 'JSON.parse error with file: ' + file.path + '. ' + params);
      }
    }
    res = {};
    if (!params) {
      return res;
    }
    r = /([\w\-]+)=(['"])([^'"]*)\2/g;
    while (m = r.exec(params)) {
      res[m[1]] = m[3];
    }
    return res;
  };

  extendCache = {};

  compileExtendFile = function(file, baseFile, extendFilePath, opt) {
    return Q.Promise(function(resolve, reject) {
      var cate, extendFile, ref;
      cate = file._lang_ || 'misc';
      extendFile = opt.enableCache === false ? null : (ref = extendCache[cate]) != null ? ref[extendFilePath] : void 0;
      if (!extendFile) {
        extendFile = new Vinyl({
          base: file.base,
          cwd: file.cwd,
          path: extendFilePath,
          contents: fs.readFileSync(extendFilePath)
        });
        if (file._lang_) {
          extendFile._lang_ = file._lang_;
        }
      }
      if (extendFile._compiled_) {
        return resolve(extendFile);
      } else {
        return (opt.layoutPreprocess || function(file, cb) {
          return cb(file);
        })(extendFile, function(extendFile) {
          return compile(extendFile, baseFile, null, opt).then(function(extendFile) {
            extendFile._compiled_ = true;
            if (opt.cacheExtend !== false) {
              if (extendCache[cate] == null) {
                extendCache[cate] = {};
              }
              extendCache[cate][extendFile.path] = extendFile;
            }
            return resolve(extendFile);
          }, function(err) {
            return reject(err);
          }).done();
        });
      }
    });
  };

  resolveFilePath = function(filePath, baseDir, relDir) {
    if (filePath.indexOf('/') === 0 && baseDir) {
      return path.join(baseDir, filePath);
    } else if (filePath.indexOf('~') === 0) {
      return path.join(path.resolve('node_modules'), filePath.slice(1));
    } else if (relDir) {
      return path.resolve(relDir, filePath);
    } else {
      return filePath;
    }
  };

  extend = function(file, baseFile, opt = {}) {
    return Q.Promise(function(resolve, reject) {
      var content, extendFilePath, fileDir;
      content = file.contents.toString();
      fileDir = path.dirname(file.path);
      extendFilePath = '';
      content.replace(/<!--\s*extend\s+(['"])([^'"]+)\1\s*-->/mg, function(full, quote, extendFileName) {
        return extendFilePath = resolveFilePath(extendFileName, opt.baseDir, fileDir);
      });
      if (extendFilePath) {
        return compileExtendFile(file, baseFile, extendFilePath, opt).then((extendFile) => {
          var sectionMap, trace;
          sectionMap = {};
          content.replace(/<!--\s*section\s+(['"])([^'"]+)\1\s*-->([\s\S]*?)<!--\s*\/section\s*-->/mg, function(full, quote, sectionName, sectionContent) {
            return sectionMap[sectionName] = sectionContent;
          });
          content = extendFile.contents.toString();
          content = content.replace(/<!--\s*yield\s+(['"])([^'"]+)\1\s*-->([\s\S]*?)<!--\s*\/yield\s*-->/mg, function(full, quote, yieldName, yieldContent) {
            return sectionMap[yieldName] || yieldContent || full;
          });
          if (opt.trace) {
            trace = '<!-- trace:' + path.relative(process.cwd(), extendFile.path) + ' -->';
            if (/(<body[^>]*>)/i.test(content)) {
              content = content.replace(/(<body[^>]*>)/i, '$1' + EOL + trace);
            } else {
              content = trace + EOL + content;
            }
          }
          file.contents = Buffer.from(content);
          return resolve(file);
        }, (err) => {
          return reject(err);
        }).done();
      } else {
        return resolve(file);
      }
    });
  };

  compile = function(file, baseFile, properties, opt) {
    return Q.Promise(function(resolve, reject) {
      var asyncList, baseDir, content, fileDir;
      content = file.contents.toString();
      content = replaceProperties(content, _.extend({}, properties, {
        _lang_: file._lang_
      }));
      asyncList = [];
      fileDir = path.dirname(file.path);
      baseDir = '';
      content = content.replace(/<!--\s*base-dir\s+(['"])([^'"]+)\1\s*-->/mg, function(full, quote, base) {
        baseDir = base;
        return '';
      });
      if (opt.babel) {
        content = content.replace(/<script ([^>]*)type="text\/babel"([^>]*)>\s*([\s\S]*?)\s*<\/script>/mg, function(full, attrLeft, attrRight, script) {
          var asyncMark, babelFile, babelFilePath;
          asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
          babelFilePath = path.resolve(fileDir, '__inline_babel_' + asyncList.length + '__.js');
          babelFile = new Vinyl({
            base: file.base,
            cwd: file.cwd,
            path: babelFilePath,
            contents: Buffer.from(script)
          });
          asyncList.push(compileBabel(babelFile, attrLeft.trim(), attrRight.trim(), opt));
          return asyncMark;
        });
      }
      content = content.replace(/<!--\s*include\s+(['"])([^'"]+)\.(less|scss|es6|coffee|css|js|ts|inc\.html)\1\s*([\s\S]*?)\s*-->/mg, function(full, quote, incName, ext, params) {
        var asyncMark, incFile, incFilePath, resolvedBaseDir, trace;
        params = getParams(params, file);
        if (params.if === 'no') {
          return full;
        }
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        resolvedBaseDir = params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir) || opt.baseDir && path.resolve(process.cwd(), opt.baseDir);
        incFilePath = resolveFilePath(incName + '.' + ext, resolvedBaseDir, fileDir);
        incFile = new Vinyl({
          base: file.base,
          cwd: file.cwd,
          path: incFilePath,
          contents: fs.readFileSync(incFilePath)
        });
        incFile._lang_ = file._lang_;
        if (ext === 'less') {
          asyncList.push(compileLess(incFile, opt));
        } else if (ext === 'scss') {
          asyncList.push(compileSass(incFile, opt));
        } else if (ext === 'coffee') {
          asyncList.push(compileCoffee(incFile, params.plainId, opt));
        } else if (ext === 'css') {
          asyncList.push(compileCss(incFile, opt));
        } else if (ext === 'js') {
          asyncList.push(compileJs(incFile, params.plainId, opt));
        } else if (ext === 'ts') {
          asyncList.push(compileTs(incFile, params.plainId, opt));
        } else {
          if (opt.trace) {
            trace = '<!-- trace:' + path.relative(process.cwd(), incFile.path) + ' -->' + EOL;
            incFile.contents = Buffer.from(trace + incFile.contents.toString());
          }
          asyncList.push(compile(incFile, baseFile, params, opt));
        }
        return asyncMark;
      });
      if (opt.optimizeRequire !== false) {
        content = content.replace(/<!--\s*require\s+(['"])([^'"]+)\1\s*([\s\S]*?)\s*-->/mg, function(full, quote, amdName, params) {
          var amdFile, amdFilePath, asyncMark, resolvedBaseDir;
          params = getParams(params, file);
          if (opt.optimizeRequire === 'ifAlways' && !params.alwaysOptimize) {
            return full;
          }
          asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
          resolvedBaseDir = params.baseDir && path.resolve(fileDir, params.baseDir) || baseDir && path.resolve(fileDir, baseDir) || opt.baseDir && path.resolve(process.cwd(), opt.baseDir);
          amdFilePath = resolveFilePath(amdName, resolvedBaseDir, fileDir);
          if (fs.existsSync(amdFilePath)) {
            amdFilePath = amdFilePath;
          } else if (fs.existsSync(amdFilePath + '.coffee')) {
            amdFilePath = amdFilePath + '.coffee';
          } else {
            amdFilePath = amdFilePath + '.js';
          }
          amdFile = new Vinyl({
            base: file.base,
            cwd: file.cwd,
            path: amdFilePath,
            contents: fs.readFileSync(amdFilePath)
          });
          asyncList.push(compileAmd(amdFile, baseFile, resolvedBaseDir, params, opt));
          return asyncMark;
        });
      }
      return Q.all(asyncList).then(function(results) {
        results.forEach(function(incFile, i) {
          return content = content.replace('<INC_PROCESS_ASYNC_MARK_' + i + '>', function() {
            return incFile.contents.toString();
          });
        });
        return htmlBase64img(content, path.dirname(file.path), opt).then(function(content) {
          file.contents = Buffer.from(content);
          if (!/\.inc\.html$/.test(file.path)) {
            return extend(file, baseFile, opt).then(function(file) {
              return resolve(file);
            }, function(err) {
              return reject(err);
            }).done();
          } else {
            return resolve(file);
          }
        }, function(err) {
          return reject(err);
        }).done();
      }, function(err) {
        return reject(err);
      }).done();
    });
  };

  getProperty = function(propName, properties) {
    var res, tmp;
    tmp = propName.split('.');
    res = properties;
    while (tmp.length && res) {
      res = res[tmp.shift()];
    }
    return res;
  };

  replaceProperties = function(content, properties) {
    if (!properties) {
      return content;
    }
    return content.replace(/%{{([\w-\.]+)}}%/g, function(full, propName) {
      var res;
      res = getProperty(propName, properties);
      if (typeof res === 'string') {
        return res;
      } else {
        return full;
      }
    });
  };

  module.exports = function(opt = {}) {
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new PluginError('gulp-html-optimizer', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new PluginError('gulp-html-optimizer', 'Streams not supported'));
      }
      return compile(file, file, null, opt).then((file) => {
        var content, trace;
        if (/\.src\..+$/.test(file.path)) {
          file.path = file.path.replace(/\.src\.(.+)$/, '\.$1');
        }
        if (opt.trace) {
          trace = '<!-- trace:' + path.relative(process.cwd(), file._originPath_ || file.path) + ' -->';
          content = file.contents.toString();
          if (/(<body[^>]*>)/i.test(content)) {
            content = content.replace(/(<body[^>]*>)/i, '$1' + EOL + trace);
          } else {
            content = trace + EOL + content;
          }
          file.contents = Buffer.from(content);
        }
        this.push(file);
        return next();
      }, (err) => {
        return this.emit('error', new PluginError('gulp-html-optimizer', err));
      }).done();
    });
  };

}).call(this);
