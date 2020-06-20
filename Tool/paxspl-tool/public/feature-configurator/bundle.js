function ConfigurationRenderer(configuration, options) {
    if (!(this instanceof ConfigurationRenderer)) return new ConfigurationRenderer(configuration);
    this.configuration = configuration;
    this.options = this.getOptions(options);
    this.model = configuration.model
}
ConfigurationRenderer.prototype.render = function() {
    var self = this;
    return self.options.renderAround.call(self, function() {
        var html = "";
        self.model.xmlModel.traverse(function(node) { html += self.options.renderFeature.call(self, self.model.getFeature(node.attr("name"))) }, function() { html += "<ul>" }, function() { html += "</ul>" });
        return html
    })
};
ConfigurationRenderer.prototype.renderTo = function(elem, fn) {
    var self = this;
    self.options.beforeRender.call(self);
    elem.empty().append(self.render());
    elem.find("ul li").each(function() { var feature = self.model.getFeature($(this).attr("name")); if (feature) self.options.initializeFeature.call(self, $(this), feature, fn) });
    self.options.afterRender.call(self)
};
ConfigurationRenderer.prototype.read = function(elem) {
    var self = this,
        obj = { selectedFeatures: [], deselectedFeatures: [] };
    elem.find("ul li").each(function() { var feature = self.model.getFeature($(this).attr("name")); if (feature) { var result = self.options.readFeature.call(self, $(this), feature); if (result) obj[result].push(feature) } });
    return new Configuration(this.model, obj.selectedFeatures, obj.deselectedFeatures)
};
ConfigurationRenderer.prototype.getOptions = function(options) {
    return $.extend({}, {
        beforeRender: function() {},
        afterRender: function() {},
        renderAround: function(fn) { return fn() },
        renderLabel: function(label, feature) { return label.text(feature.name).attr("title", feature.description) },
        renderFeature: function(feature) { var li = $("<li></li>").attr("name", feature.name).append($("<label></label>").append($('<input type="checkbox">')).append(this.options.renderLabel.call(this, $("<span></span>"), feature))); if (feature.hasValue && this.configuration.isEnabled(feature)) li.append($('<input type="text">').attr("value", feature.value)); return $("<div></div>").append(li).html() },
        initializeFeature: function(node, feature, fn) {
            var self = this;
            var change = function() { window.setTimeout(fn.bind(self), 0) };
            node.find("input[type=checkbox]").prop("disabled", this.configuration.isAutomatic(feature)).tristate({ state: this.configuration.isEnabled(feature) ? true : this.configuration.isDisabled(feature) ? null : false, change: change });
            node.find("input[type=text]").change(change)
        },
        readFeature: function(node, feature) {
            var valueInput = node.find("input[type=text]");
            if (feature.hasValue && valueInput.length) feature.setValue(valueInput.val());
            if (node.find("input[type=checkbox]").prop("disabled")) return;
            if (node.find("input[type=checkbox]").prop("checked")) return "selectedFeatures";
            else if (node.find("input[type=checkbox]").prop("indeterminate")) return "deselectedFeatures"
        }
    }, options)
};

function Configuration(model, selectedFeatures, deselectedFeatures) {
    if (!(this instanceof Configuration)) return new Configuration(model, selectedFeatures, deselectedFeatures);
    this.model = model;
    this.selectedFeatures = selectedFeatures || [];
    this.deselectedFeatures = deselectedFeatures || [];
    this.getSelectedFeature = featureGetter("selectedFeatures");
    this.getDeselectedFeature = featureGetter("deselectedFeatures")
}
Configuration.prototype.isComplete = function() { var doneFeatures = this.selectedFeatures.concat(this.deselectedFeatures).concat(this.getDeactivatedFeatures()).concat(this.getActivatedFeatures()); var everyFeatureDone = this.model.features.reduce(function(acc, feature) { return acc && !!doneFeatures.find(featureFinder(feature.name)) }, true); return this.isValid() && everyFeatureDone };
Configuration.prototype.isValid = function() { var self = this; if (self._isValid === undefined) self._isValid = self.model.constraintSolver.isValid(self); return self._isValid };
Configuration.prototype.getDeactivatedFeatures = function() { var self = this; if (self._deactivatedFeatures === undefined) self._deactivatedFeatures = self.model.features.filter(function(feature) { if (self._activatedFeatures && self._activatedFeatures.find(featureFinder(feature.name))) return false; return self.model.constraintSolver.isDeactivated(self, feature) }); return self._deactivatedFeatures };
Configuration.prototype.getActivatedFeatures = function() { var self = this; if (self._activatedFeatures === undefined) self._activatedFeatures = self.model.features.filter(function(feature) { if (self._deactivatedFeatures && self._deactivatedFeatures.find(featureFinder(feature.name))) return false; return self.model.constraintSolver.isActivated(self, feature) }); return self._activatedFeatures };
Configuration.prototype.isDeactivated = function(feature) { return !!this.getDeactivatedFeatures().find(featureFinder(feature.name)) };
Configuration.prototype.isActivated = function(feature) { return !!this.getActivatedFeatures().find(featureFinder(feature.name)) };
Configuration.prototype.isEnabled = function(feature) { return this.getSelectedFeature(feature.name) || this.isActivated(feature) };
Configuration.prototype.isDisabled = function(feature) { return this.getDeselectedFeature(feature.name) || this.isDeactivated(feature) };
Configuration.prototype.isAutomatic = function(feature) { return this.isActivated(feature) || this.isDeactivated(feature) };
Configuration.prototype.isManual = function(feature) { return this.getSelectedFeature(feature.name) || this.getDeselectedFeature(feature.name) };
Configuration.prototype.serialize = function() {
    var self = this;
    if (!self.isComplete()) throw "configuration is not complete";
    var xml = document.implementation.createDocument(null, "configuration");

    function setAttribute(node, key, value) {
        var attribute = document.createAttribute(key);
        attribute.value = value;
        node.attributes.setNamedItem(attribute)
    }
    self.model.features.forEach(function(feature) {
        var node = xml.createElement("feature");
        var manual = self.getSelectedFeature(feature.name) ? "selected" : self.getDeselectedFeature(feature.name) ? "unselected" : "undefined";
        setAttribute(node, "automatic", manual === "undefined" && self.isActivated(feature) ? "selected" : manual === "undefined" && self.isDeactivated(feature) ? "unselected" : "undefined");
        setAttribute(node, "manual", manual);
        setAttribute(node, "name", feature.name);
        if (feature.hasValue) setAttribute(node, "value", feature.value);
        xml.children[0].appendChild(node)
    });
    return (new XMLSerializer).serializeToString(xml)
};
Configuration.fromXml = function(model, xml) {
    var selectedFeatures = [],
        deselectedFeatures = [];
    $(xml).find("feature").each(function() {
        var feature = model.getFeature($(this).attr("name")),
            value = $(this).attr("value");
        if ($(this).attr("manual") === "selected") selectedFeatures.push(feature);
        else if ($(this).attr("manual") === "unselected") deselectedFeatures.push(feature);
        if (typeof value !== typeof undefined) feature.setValue(value)
    });
    return new Configuration(model, selectedFeatures, deselectedFeatures)
};

function Configurator(model, options, configuration) {
    if (!(this instanceof Configurator)) return new Configurator(model, options, configuration);
    this.model = model;
    this.options = options || {};
    this.options.target = this.options.target || $("body");
    this.render(configuration)
}
Configurator.prototype.render = function(configuration) {
    var self = this;
    configuration = configuration || new Configuration(this.model);
    self.configuration = configuration;
    var configurationRenderer = new ConfigurationRenderer(configuration, this.options.renderer);
    configurationRenderer.renderTo(self.options.target, function() {
        var newConfiguration = this.read(self.options.target);
        if (newConfiguration.isValid()) self.render(newConfiguration);
        else self.render(this.configuration)
    })
};

function ConstraintSolver(model) {
    if (!(this instanceof ConstraintSolver)) return new ConstraintSolver(model);
    var self = this;
    var solver = this.solver = new Logic.Solver;

    function getCrossTreeConstraints() { return model.xmlModel.rules.get().map(self.crossTreeConstraint.bind(self)) }
    var featureConstraintSemantics = [function root(feature) { if (!feature.parent) return feature.name }, function mandatory(feature) { if (feature.parent && feature.mandatory) return Logic.equiv(feature.name, feature.parent.name) }, function optional(feature) { if (feature.parent) return Logic.implies(feature.name, feature.parent.name) }, function alternative(feature) {
        if (feature.alternative) {
            var children = feature.children.map(featureName());
            var alternativeConstraints = [];
            for (var i = 0; i < children.length; i++)
                for (var j = 0; j < i; j++) alternativeConstraints.push(Logic.not(Logic.and(children[i], children[j])));
            return Logic.and(Logic.equiv(feature.name, Logic.or(children)), alternativeConstraints)
        }
    }, function or(feature) { if (feature.or) { var children = feature.children.map(featureName()); return Logic.equiv(feature.name, Logic.or(children)) } }];
    model.features.forEach(function(feature) { featureConstraintSemantics.forEach(function(semantics) { var formula = semantics(feature); if (formula) solver.require(formula) }) });
    getCrossTreeConstraints().forEach(function(constraint) { solver.require(constraint) })
}
ConstraintSolver.prototype.crossTreeConstraint = function(rule) {
    var self = this,
        op = rule.tagName,
        num = $(rule).children().length;

    function constrainedChild(n) { return self.crossTreeConstraint($(rule).children()[n]) }
    if (op === "eq" && num === 2) return Logic.equiv(constrainedChild(0), constrainedChild(1));
    if (op === "imp" && num === 2) return Logic.implies(constrainedChild(0), constrainedChild(1));
    if (op === "conj" && num === 2) return Logic.and(constrainedChild(0), constrainedChild(1));
    if (op === "disj" && num === 2) return Logic.or(constrainedChild(0), constrainedChild(1));
    if (op === "not" && num === 1) return Logic.not(constrainedChild(0));
    if (op === "var" && num === 0) return $(rule).text();
    throw "unknown operation " + op + " with " + num + " arguments encountered"
};
ConstraintSolver.prototype.configurationConstraint = function(configuration, excludeFeature) {
    function not(excludeFeature) { return function(feature) { return !excludeFeature || excludeFeature.name !== feature.name } }
    return Logic.and(configuration.selectedFeatures.filter(not(excludeFeature)).map(featureName()), configuration.deselectedFeatures.filter(not(excludeFeature)).map(featureName()).map(function(feature) { return Logic.not(feature) }))
};
ConstraintSolver.prototype.isValid = function(configuration) { return !!this.solver.solveAssuming(this.configurationConstraint(configuration)) };
ConstraintSolver.prototype.isDeactivated = function(configuration, feature) { return !this.solver.solveAssuming(Logic.and(this.configurationConstraint(configuration, feature), feature.name)) };
ConstraintSolver.prototype.isActivated = function(configuration, feature) { return !this.solver.solveAssuming(Logic.and(this.configurationConstraint(configuration, feature), Logic.not(feature.name))) };

function Feature(node, parent, children) {
    if (!(this instanceof Feature)) return new Feature(node, parent, children);
    var self = this;

    function getDescription(node) { var description = node.find("> description").get(); return description.length === 1 ? $(description[0]).text().split("\n").map(function(line) { return line.trim() }).join("\n").trim() : null }
    this.name = node.attr("name");
    this.description = getDescription(node);
    this.mandatory = node.attr("mandatory") === "true";
    this.alternative = node.prop("tagName") === "alt";
    this.or = node.prop("tagName") === "or";
    this.parent = parent ? new Feature(parent) : null;
    if (children && (this.alternative || this.or)) this.children = children.get().filter(function(child) { return ["feature", "and", "or", "alt"].includes($(child).prop("tagName")) }).map(function(child) { return Feature($(child)) });
    this.value = node.attr("value");
    this.hasValue = typeof this.value !== typeof undefined && this.value !== false;
    this.setValue = function(value) {
        if (!self.hasValue) throw "not a value feature";
        self.value = value
    }
}

function featureFinder(name) { return function(feature) { return feature.name === name } }

function featureGetter(key) { return function(name) { return this[key].find(featureFinder(name)) } }

function featureName() { return function(feature) { return feature.name } }(function(f) {
    if (typeof exports === "object" && typeof module !== "undefined") { module.exports = f() } else if (typeof define === "function" && define.amd) { define([], f) } else {
        var g;
        if (typeof window !== "undefined") { g = window } else if (typeof global !== "undefined") { g = global } else if (typeof self !== "undefined") { g = self } else { g = this }
        g.Logic = f()
    }
})(function() {
    var define, module, exports;
    return function e(t, n, r) {
        function s(o, u) {
            if (!n[o]) {
                if (!t[o]) { var a = typeof require == "function" && require; if (!u && a) return a(o, !0); if (i) return i(o, !0); var f = new Error("Cannot find module '" + o + "'"); throw f.code = "MODULE_NOT_FOUND", f }
                var l = n[o] = { exports: {} };
                t[o][0].call(l.exports, function(e) { var n = t[o][1][e]; return s(n ? n : e) }, l, l.exports, e, t, n, r)
            }
            return n[o].exports
        }
        var i = typeof require == "function" && require;
        for (var o = 0; o < r.length; o++) s(r[o]);
        return s
    }({
        1: [function(require, module, exports) {
            var MiniSat = require("./minisat_wrapper.js");
            var _ = require("underscore");
            var Logic;
            Logic = {};
            var withDescription = function(description, tester) { tester.description = description; return tester };
            var lazyInstanceofTester = function(description, obj, constructorName) { return withDescription(description, function(x) { return x instanceof obj[constructorName] }) };
            Logic.isNumTerm = withDescription("a NumTerm (non-zero integer)", function(x) { return x === (x | 0) && x !== 0 });
            Logic.isNameTerm = withDescription("a NameTerm (string)", function(x) { return typeof x === "string" && !/^-*[0-9]*$/.test(x) });
            Logic.isTerm = withDescription("a Term (appropriate string or number)", function(x) { return Logic.isNumTerm(x) || Logic.isNameTerm(x) });
            Logic.isWholeNumber = withDescription("a whole number (integer >= 0)", function(x) { return x === (x | 0) && x >= 0 });
            Logic.isFormula = lazyInstanceofTester("a Formula", Logic, "Formula");
            Logic.isClause = lazyInstanceofTester("a Clause", Logic, "Clause");
            Logic.isBits = lazyInstanceofTester("a Bits", Logic, "Bits");
            Logic._isInteger = withDescription("an integer", function(x) { return x === (x | 0) });
            Logic._isFunction = withDescription("a Function", function(x) { return typeof x === "function" });
            Logic._isString = withDescription("a String", function(x) { return typeof x === "string" });
            Logic._isArrayWhere = function(tester) { var description = "an array"; if (tester.description) { description += " of " + tester.description } return withDescription(description, function(x) { if (!_.isArray(x)) { return false } else { for (var i = 0; i < x.length; i++) { if (!tester(x[i])) { return false } } return true } }) };
            Logic._isFormulaOrTerm = withDescription("a Formula or Term", function(x) { return Logic.isFormula(x) || Logic.isTerm(x) });
            Logic._isFormulaOrTermOrBits = withDescription("a Formula, Term, or Bits", function(x) { return Logic.isFormula(x) || Logic.isBits(x) || Logic.isTerm(x) });
            Logic._MiniSat = MiniSat;
            var isInteger = Logic._isInteger;
            var isFunction = Logic._isFunction;
            var isString = Logic._isString;
            var isArrayWhere = Logic._isArrayWhere;
            var isFormulaOrTerm = Logic._isFormulaOrTerm;
            var isFormulaOrTermOrBits = Logic._isFormulaOrTermOrBits;
            Logic._assert = function(value, tester, description) { if (!tester(value)) { var displayValue = typeof value === "string" ? JSON.stringify(value) : value; throw new Error(displayValue + " is not " + (tester.description || description)) } };
            var assertNumArgs = function(actual, expected, funcName) { if (actual !== expected) { throw new Error("Expected " + expected + " args in " + funcName + ", got " + actual) } };
            var assert = Logic._assert;
            Logic._assertIfEnabled = function(value, tester, description) { if (assert) assert(value, tester, description) };
            Logic.disablingAssertions = function(f) { var oldAssert = assert; try { assert = null; return f() } finally { assert = oldAssert } };
            Logic._disablingTypeChecks = Logic.disablingAssertions;
            Logic.not = function(operand) { if (assert) assert(operand, isFormulaOrTerm); if (operand instanceof Logic.Formula) { return new Logic.NotFormula(operand) } else { if (typeof operand === "number") { return -operand } else if (operand.charAt(0) === "-") { return operand.slice(1) } else { return "-" + operand } } };
            Logic.NAME_FALSE = "$F";
            Logic.NAME_TRUE = "$T";
            Logic.NUM_FALSE = 1;
            Logic.NUM_TRUE = 2;
            Logic.TRUE = Logic.NAME_TRUE;
            Logic.FALSE = Logic.NAME_FALSE;
            Logic.Formula = function() {};
            Logic._defineFormula = function(constructor, typeName, methods) {
                if (assert) assert(constructor, isFunction);
                if (assert) assert(typeName, isString);
                constructor.prototype = new Logic.Formula;
                constructor.prototype.type = typeName;
                if (methods) { _.extend(constructor.prototype, methods) }
            };
            Logic.Formula.prototype.generateClauses = function(isTrue, termifier) { throw new Error("Cannot generate this Formula; it must be expanded") };
            Logic.Formula._nextGuid = 1;
            Logic.Formula.prototype._guid = null;
            Logic.Formula.prototype.guid = function() { if (this._guid === null) { this._guid = Logic.Formula._nextGuid++ } return this._guid };
            Logic.Clause = function() {
                var terms = _.flatten(arguments);
                if (assert) assert(terms, isArrayWhere(Logic.isNumTerm));
                this.terms = terms
            };
            Logic.Clause.prototype.append = function() { return new Logic.Clause(this.terms.concat(_.flatten(arguments))) };
            var FormulaInfo = function() {
                this.varName = null;
                this.varNum = null;
                this.occursPositively = false;
                this.occursNegatively = false;
                this.isRequired = false;
                this.isForbidden = false
            };
            Logic.Termifier = function(solver) { this.solver = solver };
            Logic.Termifier.prototype.clause = function() { var self = this; var formulas = _.flatten(arguments); if (assert) assert(formulas, isArrayWhere(isFormulaOrTerm)); return new Logic.Clause(_.map(formulas, function(f) { return self.term(f) })) };
            Logic.Termifier.prototype.term = function(formula) { return this.solver._formulaToTerm(formula) };
            Logic.Termifier.prototype.generate = function(isTrue, formula) { return this.solver._generateFormula(isTrue, formula, this) };
            Logic.Solver = function() {
                var self = this;
                self.clauses = [];
                self._num2name = [null];
                self._name2num = {};
                var F = self.getVarNum(Logic.NAME_FALSE, false, true);
                var T = self.getVarNum(Logic.NAME_TRUE, false, true);
                if (F !== Logic.NUM_FALSE || T !== Logic.NUM_TRUE) { throw new Error("Assertion failure: $T and $F have wrong numeric value") }
                self._F_used = false;
                self._T_used = false;
                self.clauses.push(new Logic.Clause(-Logic.NUM_FALSE));
                self.clauses.push(new Logic.Clause(Logic.NUM_TRUE));
                self._formulaInfo = {};
                self._nextFormulaNumByType = {};
                self._ungeneratedFormulas = {};
                self._numClausesAddedToMiniSat = 0;
                self._unsat = false;
                self._minisat = new MiniSat;
                self._termifier = new Logic.Termifier(self)
            };
            Logic.Solver.prototype.getVarNum = function(vname, noCreate, _createInternals) {
                var key = " " + vname;
                if (_.has(this._name2num, key)) { return this._name2num[key] } else if (noCreate) { return 0 } else {
                    if (vname.charAt(0) === "$" && !_createInternals) { throw new Error("Only generated variable names can start with $") }
                    var vnum = this._num2name.length;
                    this._name2num[key] = vnum;
                    this._num2name.push(vname);
                    return vnum
                }
            };
            Logic.Solver.prototype.getVarName = function(vnum) { if (assert) assert(vnum, isInteger); var num2name = this._num2name; if (vnum < 1 || vnum >= num2name.length) { throw new Error("Bad variable num: " + vnum) } else { return num2name[vnum] } };
            Logic.Solver.prototype.toNumTerm = function(t, noCreate) {
                var self = this;
                if (assert) assert(t, Logic.isTerm);
                if (typeof t === "number") { return t } else {
                    var not = false;
                    while (t.charAt(0) === "-") {
                        t = t.slice(1);
                        not = !not
                    }
                    var n = self.getVarNum(t, noCreate);
                    if (!n) { return 0 } else { return not ? -n : n }
                }
            };
            Logic.Solver.prototype.toNameTerm = function(t) {
                var self = this;
                if (assert) assert(t, Logic.isTerm);
                if (typeof t === "string") { while (t.slice(0, 2) === "--") { t = t.slice(2) } return t } else {
                    var not = false;
                    if (t < 0) {
                        not = true;
                        t = -t
                    }
                    t = self.getVarName(t);
                    if (not) { t = "-" + t }
                    return t
                }
            };
            Logic.Solver.prototype._addClause = function(cls, _extraTerms, _useTermOverride) {
                var self = this;
                if (assert) assert(cls, Logic.isClause);
                var extraTerms = null;
                if (_extraTerms) { extraTerms = _extraTerms; if (assert) assert(extraTerms, isArrayWhere(Logic.isNumTerm)) }
                var usedF = false;
                var usedT = false;
                var numRealTerms = cls.terms.length;
                if (extraTerms) { cls = cls.append(extraTerms) }
                for (var i = 0; i < cls.terms.length; i++) { var t = cls.terms[i]; var v = t < 0 ? -t : t; if (v === Logic.NUM_FALSE) { usedF = true } else if (v === Logic.NUM_TRUE) { usedT = true } else if (v < 1 || v >= self._num2name.length) { throw new Error("Bad variable number: " + v) } else if (i < numRealTerms) { if (_useTermOverride) { _useTermOverride(t) } else { self._useFormulaTerm(t) } } }
                this._F_used = this._F_used || usedF;
                this._T_used = this._T_used || usedT;
                this.clauses.push(cls)
            };
            Logic.Solver.prototype._useFormulaTerm = function(t, _addClausesOverride) {
                var self = this;
                if (assert) assert(t, Logic.isNumTerm);
                var v = t < 0 ? -t : t;
                if (!_.has(self._ungeneratedFormulas, v)) { return }
                var formula = self._ungeneratedFormulas[v];
                var info = self._getFormulaInfo(formula);
                var positive = t > 0;
                var deferredAddClauses = null;
                var addClauses;
                if (!_addClausesOverride) {
                    deferredAddClauses = [];
                    addClauses = function(clauses, extraTerms) { deferredAddClauses.push({ clauses: clauses, extraTerms: extraTerms }) }
                } else { addClauses = _addClausesOverride }
                if (positive && !info.occursPositively) {
                    info.occursPositively = true;
                    var clauses = self._generateFormula(true, formula);
                    addClauses(clauses, [-v])
                } else if (!positive && !info.occursNegatively) {
                    info.occursNegatively = true;
                    var clauses = self._generateFormula(false, formula);
                    addClauses(clauses, [v])
                }
                if (info.occursPositively && info.occursNegatively) { delete self._ungeneratedFormulas[v] }
                if (!(deferredAddClauses && deferredAddClauses.length)) { return }
                var useTerm = function(t) { self._useFormulaTerm(t, addClauses) };
                while (deferredAddClauses.length) {
                    var next = deferredAddClauses.pop();
                    self._addClauses(next.clauses, next.extraTerms, useTerm)
                }
            };
            Logic.Solver.prototype._addClauses = function(array, _extraTerms, _useTermOverride) {
                if (assert) assert(array, isArrayWhere(Logic.isClause));
                var self = this;
                _.each(array, function(cls) { self._addClause(cls, _extraTerms, _useTermOverride) })
            };
            Logic.Solver.prototype.require = function() { this._requireForbidImpl(true, _.flatten(arguments)) };
            Logic.Solver.prototype.forbid = function() { this._requireForbidImpl(false, _.flatten(arguments)) };
            Logic.Solver.prototype._requireForbidImpl = function(isRequire, formulas) {
                var self = this;
                if (assert) assert(formulas, isArrayWhere(isFormulaOrTerm));
                _.each(formulas, function(f) {
                    if (f instanceof Logic.NotFormula) { self._requireForbidImpl(!isRequire, [f.operand]) } else if (f instanceof Logic.Formula) {
                        var info = self._getFormulaInfo(f);
                        if (info.varNum !== null) {
                            var sign = isRequire ? 1 : -1;
                            self._addClause(new Logic.Clause(sign * info.varNum))
                        } else { self._addClauses(self._generateFormula(isRequire, f)) }
                        if (isRequire) { info.isRequired = true } else { info.isForbidden = true }
                    } else { self._addClauses(self._generateFormula(isRequire, f)) }
                })
            };
            Logic.Solver.prototype._generateFormula = function(isTrue, formula, _termifier) { var self = this; if (assert) assert(formula, isFormulaOrTerm); if (formula instanceof Logic.NotFormula) { return self._generateFormula(!isTrue, formula.operand) } else if (formula instanceof Logic.Formula) { var info = self._getFormulaInfo(formula); if (isTrue && info.isRequired || !isTrue && info.isForbidden) { return [] } else if (isTrue && info.isForbidden || !isTrue && info.isRequired) { return [new Logic.Clause] } else { var ret = formula.generateClauses(isTrue, _termifier || self._termifier); return _.isArray(ret) ? ret : [ret] } } else { var t = self.toNumTerm(formula); var sign = isTrue ? 1 : -1; if (t === sign * Logic.NUM_TRUE || t === -sign * Logic.NUM_FALSE) { return [] } else if (t === sign * Logic.NUM_FALSE || t === -sign * Logic.NUM_TRUE) { return [new Logic.Clause] } else { return [new Logic.Clause(sign * t)] } } };
            Logic.Solver.prototype._clauseData = function() { var clauses = _.pluck(this.clauses, "terms"); if (!this._T_used) { clauses.splice(1, 1) } if (!this._F_used) { clauses.splice(0, 1) } return clauses };
            Logic.Solver.prototype._clauseStrings = function() {
                var self = this;
                var clauseData = self._clauseData();
                return _.map(clauseData, function(clause) {
                    return _.map(clause, function(nterm) {
                        var str = self.toNameTerm(nterm);
                        if (/\s/.test(str)) {
                            var sign = "";
                            if (str.charAt(0) === "-") {
                                sign = "-";
                                str = str.slice(1)
                            }
                            str = sign + '"' + str + '"'
                        }
                        return str
                    }).join(" v ")
                })
            };
            Logic.Solver.prototype._getFormulaInfo = function(formula, _noCreate) {
                var self = this;
                var guid = formula.guid();
                if (!self._formulaInfo[guid]) {
                    if (_noCreate) { return null }
                    self._formulaInfo[guid] = new FormulaInfo
                }
                return self._formulaInfo[guid]
            };
            Logic.Solver.prototype._formulaToTerm = function(formula) {
                var self = this;
                if (_.isArray(formula)) { if (assert) assert(formula, isArrayWhere(isFormulaOrTerm)); return _.map(formula, _.bind(self._formulaToTerm, self)) } else { if (assert) assert(formula, isFormulaOrTerm) }
                if (formula instanceof Logic.NotFormula) { return Logic.not(self._formulaToTerm(formula.operand)) } else if (formula instanceof Logic.Formula) {
                    var info = this._getFormulaInfo(formula);
                    if (info.isRequired) { return Logic.NUM_TRUE } else if (info.isForbidden) { return Logic.NUM_FALSE } else if (info.varNum === null) {
                        var type = formula.type;
                        if (!this._nextFormulaNumByType[type]) { this._nextFormulaNumByType[type] = 1 }
                        var numForVarName = this._nextFormulaNumByType[type]++;
                        info.varName = "$" + formula.type + numForVarName;
                        info.varNum = this.getVarNum(info.varName, false, true);
                        this._ungeneratedFormulas[info.varNum] = formula
                    }
                    return info.varNum
                } else { return self.toNumTerm(formula) }
            };
            Logic.or = function() { var args = _.flatten(arguments); if (args.length === 0) { return Logic.FALSE } else if (args.length === 1) { if (assert) assert(args[0], isFormulaOrTerm); return args[0] } else { return new Logic.OrFormula(args) } };
            Logic.OrFormula = function(operands) {
                if (assert) assert(operands, isArrayWhere(isFormulaOrTerm));
                this.operands = operands
            };
            Logic._defineFormula(Logic.OrFormula, "or", {
                generateClauses: function(isTrue, t) {
                    if (isTrue) { return t.clause(this.operands) } else {
                        var result = [];
                        _.each(this.operands, function(o) { result.push.apply(result, t.generate(false, o)) });
                        return result
                    }
                }
            });
            Logic.NotFormula = function(operand) {
                if (assert) assert(operand, isFormulaOrTerm);
                this.operand = operand
            };
            Logic._defineFormula(Logic.NotFormula, "not");
            Logic.and = function() { var args = _.flatten(arguments); if (args.length === 0) { return Logic.TRUE } else if (args.length === 1) { if (assert) assert(args[0], isFormulaOrTerm); return args[0] } else { return new Logic.AndFormula(args) } };
            Logic.AndFormula = function(operands) {
                if (assert) assert(operands, isArrayWhere(isFormulaOrTerm));
                this.operands = operands
            };
            Logic._defineFormula(Logic.AndFormula, "and", {
                generateClauses: function(isTrue, t) {
                    if (isTrue) {
                        var result = [];
                        _.each(this.operands, function(o) { result.push.apply(result, t.generate(true, o)) });
                        return result
                    } else { return t.clause(_.map(this.operands, Logic.not)) }
                }
            });
            var group = function(array, N) { var ret = []; for (var i = 0; i < array.length; i += N) { ret.push(array.slice(i, i + N)) } return ret };
            Logic.xor = function() { var args = _.flatten(arguments); if (args.length === 0) { return Logic.FALSE } else if (args.length === 1) { if (assert) assert(args[0], isFormulaOrTerm); return args[0] } else { return new Logic.XorFormula(args) } };
            Logic.XorFormula = function(operands) {
                if (assert) assert(operands, isArrayWhere(isFormulaOrTerm));
                this.operands = operands
            };
            Logic._defineFormula(Logic.XorFormula, "xor", {
                generateClauses: function(isTrue, t) {
                    var args = this.operands;
                    var not = Logic.not;
                    if (args.length > 3) { return t.generate(isTrue, Logic.xor(_.map(group(this.operands, 3), function(group) { return Logic.xor(group) }))) } else if (isTrue) {
                        if (args.length === 0) { return t.clause() } else if (args.length === 1) { return t.clause(args[0]) } else if (args.length === 2) {
                            var A = args[0],
                                B = args[1];
                            return [t.clause(A, B), t.clause(not(A), not(B))]
                        } else if (args.length === 3) {
                            var A = args[0],
                                B = args[1],
                                C = args[2];
                            return [t.clause(A, B, C), t.clause(A, not(B), not(C)), t.clause(not(A), B, not(C)), t.clause(not(A), not(B), C)]
                        }
                    } else {
                        if (args.length === 0) { return [] } else if (args.length === 1) { return t.clause(not(args[0])) } else if (args.length === 2) {
                            var A = args[0],
                                B = args[1];
                            return [t.clause(A, not(B)), t.clause(not(A), B)]
                        } else if (args.length === 3) {
                            var A = args[0],
                                B = args[1],
                                C = args[2];
                            return [t.clause(not(A), not(B), not(C)), t.clause(not(A), B, C), t.clause(A, not(B), C), t.clause(A, B, not(C))]
                        }
                    }
                }
            });
            Logic.atMostOne = function() { var args = _.flatten(arguments); if (args.length <= 1) { return Logic.TRUE } else { return new Logic.AtMostOneFormula(args) } };
            Logic.AtMostOneFormula = function(operands) {
                if (assert) assert(operands, isArrayWhere(isFormulaOrTerm));
                this.operands = operands
            };
            Logic._defineFormula(Logic.AtMostOneFormula, "atMostOne", {
                generateClauses: function(isTrue, t) {
                    var args = this.operands;
                    var not = Logic.not;
                    if (args.length <= 1) { return [] } else if (args.length === 2) { return t.generate(isTrue, Logic.not(Logic.and(args))) } else if (isTrue && args.length === 3) { var clauses = []; for (var i = 0; i < args.length; i++) { for (var j = i + 1; j < args.length; j++) { clauses.push(t.clause(not(args[i]), not(args[j]))) } } return clauses } else if (!isTrue && args.length === 3) {
                        var A = args[0],
                            B = args[1],
                            C = args[2];
                        return [t.clause(A, B), t.clause(A, C), t.clause(B, C)]
                    } else { var groups = group(args, 3); var ors = _.map(groups, function(g) { return Logic.or(g) }); if (groups[groups.length - 1].length < 2) { groups.pop() } var atMostOnes = _.map(groups, function(g) { return Logic.atMostOne(g) }); return t.generate(isTrue, Logic.and(Logic.atMostOne(ors), atMostOnes)) }
                }
            });
            Logic.implies = function(A, B) { if (assert) assertNumArgs(arguments.length, 2, "Logic.implies"); return new Logic.ImpliesFormula(A, B) };
            Logic.ImpliesFormula = function(A, B) {
                if (assert) assert(A, isFormulaOrTerm);
                if (assert) assert(B, isFormulaOrTerm);
                if (assert) assertNumArgs(arguments.length, 2, "Logic.implies");
                this.A = A;
                this.B = B
            };
            Logic._defineFormula(Logic.ImpliesFormula, "implies", { generateClauses: function(isTrue, t) { return t.generate(isTrue, Logic.or(Logic.not(this.A), this.B)) } });
            Logic.equiv = function(A, B) { if (assert) assertNumArgs(arguments.length, 2, "Logic.equiv"); return new Logic.EquivFormula(A, B) };
            Logic.EquivFormula = function(A, B) {
                if (assert) assert(A, isFormulaOrTerm);
                if (assert) assert(B, isFormulaOrTerm);
                if (assert) assertNumArgs(arguments.length, 2, "Logic.equiv");
                this.A = A;
                this.B = B
            };
            Logic._defineFormula(Logic.EquivFormula, "equiv", { generateClauses: function(isTrue, t) { return t.generate(!isTrue, Logic.xor(this.A, this.B)) } });
            Logic.exactlyOne = function() { var args = _.flatten(arguments); if (args.length === 0) { return Logic.FALSE } else if (args.length === 1) { if (assert) assert(args[0], isFormulaOrTerm); return args[0] } else { return new Logic.ExactlyOneFormula(args) } };
            Logic.ExactlyOneFormula = function(operands) {
                if (assert) assert(operands, isArrayWhere(isFormulaOrTerm));
                this.operands = operands
            };
            Logic._defineFormula(Logic.ExactlyOneFormula, "exactlyOne", { generateClauses: function(isTrue, t) { var args = this.operands; if (args.length < 3) { return t.generate(isTrue, Logic.xor(args)) } else { return t.generate(isTrue, Logic.and(Logic.atMostOne(args), Logic.or(args))) } } });
            Logic.Bits = function(formulaArray) {
                if (assert) assert(formulaArray, isArrayWhere(isFormulaOrTerm));
                this.bits = formulaArray
            };
            Logic.constantBits = function(wholeNumber) {
                if (assert) assert(wholeNumber, Logic.isWholeNumber);
                var result = [];
                while (wholeNumber) {
                    result.push(wholeNumber & 1 ? Logic.TRUE : Logic.FALSE);
                    wholeNumber >>>= 1
                }
                return new Logic.Bits(result)
            };
            Logic.variableBits = function(baseName, nbits) { if (assert) assert(nbits, Logic.isWholeNumber); var result = []; for (var i = 0; i < nbits; i++) { result.push(baseName + "$" + i) } return new Logic.Bits(result) };
            Logic.lessThanOrEqual = function(bits1, bits2) { return new Logic.LessThanOrEqualFormula(bits1, bits2) };
            Logic.LessThanOrEqualFormula = function(bits1, bits2) {
                if (assert) assert(bits1, Logic.isBits);
                if (assert) assert(bits2, Logic.isBits);
                if (assert) assertNumArgs(arguments.length, 2, "Bits comparison function");
                this.bits1 = bits1;
                this.bits2 = bits2
            };
            var genLTE = function(bits1, bits2, t, notEqual) {
                var ret = [];
                var A = bits1.bits.slice();
                var B = bits2.bits.slice();
                if (notEqual && !bits2.bits.length) { return t.clause() }
                while (A.length > B.length) {
                    var hi = A.pop();
                    ret.push(t.clause(Logic.not(hi)))
                }
                var xors = _.map(B, function(b, i) { if (i < A.length) { return Logic.xor(A[i], b) } else { return b } });
                for (var i = A.length - 1; i >= 0; i--) { ret.push(t.clause(xors.slice(i + 1), Logic.not(A[i]), B[i])) }
                if (notEqual) { ret.push.apply(ret, t.generate(true, Logic.or(xors))) }
                return ret
            };
            Logic._defineFormula(Logic.LessThanOrEqualFormula, "lte", { generateClauses: function(isTrue, t) { if (isTrue) { return genLTE(this.bits1, this.bits2, t, false) } else { return genLTE(this.bits2, this.bits1, t, true) } } });
            Logic.lessThan = function(bits1, bits2) { return new Logic.LessThanFormula(bits1, bits2) };
            Logic.LessThanFormula = function(bits1, bits2) {
                if (assert) assert(bits1, Logic.isBits);
                if (assert) assert(bits2, Logic.isBits);
                if (assert) assertNumArgs(arguments.length, 2, "Bits comparison function");
                this.bits1 = bits1;
                this.bits2 = bits2
            };
            Logic._defineFormula(Logic.LessThanFormula, "lt", { generateClauses: function(isTrue, t) { if (isTrue) { return genLTE(this.bits1, this.bits2, t, true) } else { return genLTE(this.bits2, this.bits1, t, false) } } });
            Logic.greaterThan = function(bits1, bits2) { return Logic.lessThan(bits2, bits1) };
            Logic.greaterThanOrEqual = function(bits1, bits2) { return Logic.lessThanOrEqual(bits2, bits1) };
            Logic.equalBits = function(bits1, bits2) { return new Logic.EqualBitsFormula(bits1, bits2) };
            Logic.EqualBitsFormula = function(bits1, bits2) {
                if (assert) assert(bits1, Logic.isBits);
                if (assert) assert(bits2, Logic.isBits);
                if (assert) assertNumArgs(arguments.length, 2, "Logic.equalBits");
                this.bits1 = bits1;
                this.bits2 = bits2
            };
            Logic._defineFormula(Logic.EqualBitsFormula, "equalBits", { generateClauses: function(isTrue, t) { var A = this.bits1.bits; var B = this.bits2.bits; var nbits = Math.max(A.length, B.length); var facts = []; for (var i = 0; i < nbits; i++) { if (i >= A.length) { facts.push(Logic.not(B[i])) } else if (i >= B.length) { facts.push(Logic.not(A[i])) } else { facts.push(Logic.equiv(A[i], B[i])) } } return t.generate(isTrue, Logic.and(facts)) } });
            Logic.HalfAdderSum = function(formula1, formula2) {
                if (assert) assert(formula1, isFormulaOrTerm);
                if (assert) assert(formula2, isFormulaOrTerm);
                if (assert) assertNumArgs(arguments.length, 2, "Logic.HalfAdderSum");
                this.a = formula1;
                this.b = formula2
            };
            Logic._defineFormula(Logic.HalfAdderSum, "hsum", { generateClauses: function(isTrue, t) { return t.generate(isTrue, Logic.xor(this.a, this.b)) } });
            Logic.HalfAdderCarry = function(formula1, formula2) {
                if (assert) assert(formula1, isFormulaOrTerm);
                if (assert) assert(formula2, isFormulaOrTerm);
                if (assert) assertNumArgs(arguments.length, 2, "Logic.HalfAdderCarry");
                this.a = formula1;
                this.b = formula2
            };
            Logic._defineFormula(Logic.HalfAdderCarry, "hcarry", { generateClauses: function(isTrue, t) { return t.generate(isTrue, Logic.and(this.a, this.b)) } });
            Logic.FullAdderSum = function(formula1, formula2, formula3) {
                if (assert) assert(formula1, isFormulaOrTerm);
                if (assert) assert(formula2, isFormulaOrTerm);
                if (assert) assert(formula3, isFormulaOrTerm);
                if (assert) assertNumArgs(arguments.length, 3, "Logic.FullAdderSum");
                this.a = formula1;
                this.b = formula2;
                this.c = formula3
            };
            Logic._defineFormula(Logic.FullAdderSum, "fsum", { generateClauses: function(isTrue, t) { return t.generate(isTrue, Logic.xor(this.a, this.b, this.c)) } });
            Logic.FullAdderCarry = function(formula1, formula2, formula3) {
                if (assert) assert(formula1, isFormulaOrTerm);
                if (assert) assert(formula2, isFormulaOrTerm);
                if (assert) assert(formula3, isFormulaOrTerm);
                if (assert) assertNumArgs(arguments.length, 3, "Logic.FullAdderCarry");
                this.a = formula1;
                this.b = formula2;
                this.c = formula3
            };
            Logic._defineFormula(Logic.FullAdderCarry, "fcarry", { generateClauses: function(isTrue, t) { return t.generate(!isTrue, Logic.atMostOne(this.a, this.b, this.c)) } });
            var binaryWeightedSum = function(varsByWeight) {
                if (assert) assert(varsByWeight, isArrayWhere(isArrayWhere(isFormulaOrTerm)));
                var buckets = _.map(varsByWeight, _.clone);
                var lowestWeight = 0;
                var output = [];
                while (lowestWeight < buckets.length) {
                    var bucket = buckets[lowestWeight];
                    if (!bucket.length) {
                        output.push(Logic.FALSE);
                        lowestWeight++
                    } else if (bucket.length === 1) {
                        output.push(bucket[0]);
                        lowestWeight++
                    } else if (bucket.length === 2) {
                        var sum = new Logic.HalfAdderSum(bucket[0], bucket[1]);
                        var carry = new Logic.HalfAdderCarry(bucket[0], bucket[1]);
                        bucket.length = 0;
                        bucket.push(sum);
                        pushToNth(buckets, lowestWeight + 1, carry)
                    } else {
                        var c = bucket.pop();
                        var b = bucket.pop();
                        var a = bucket.pop();
                        var sum = new Logic.FullAdderSum(a, b, c);
                        var carry = new Logic.FullAdderCarry(a, b, c);
                        bucket.push(sum);
                        pushToNth(buckets, lowestWeight + 1, carry)
                    }
                }
                return output
            };
            var pushToNth = function(arrayOfArrays, n, newItem) {
                while (n >= arrayOfArrays.length) { arrayOfArrays.push([]) }
                arrayOfArrays[n].push(newItem)
            };
            var checkWeightedSumArgs = function(formulas, weights) { if (assert) assert(formulas, isArrayWhere(isFormulaOrTerm)); if (typeof weights === "number") { if (assert) assert(weights, Logic.isWholeNumber) } else { if (assert) assert(weights, isArrayWhere(Logic.isWholeNumber)); if (formulas.length !== weights.length) { throw new Error("Formula array and weight array must be same length" + "; they are " + formulas.length + " and " + weights.length) } } };
            Logic.weightedSum = function(formulas, weights) {
                checkWeightedSumArgs(formulas, weights);
                if (formulas.length === 0) { return new Logic.Bits([]) }
                if (typeof weights === "number") { weights = _.map(formulas, function() { return weights }) }
                var binaryWeighted = [];
                _.each(formulas, function(f, i) {
                    var w = weights[i];
                    var whichBit = 0;
                    while (w) {
                        if (w & 1) { pushToNth(binaryWeighted, whichBit, f) }
                        w >>>= 1;
                        whichBit++
                    }
                });
                return new Logic.Bits(binaryWeightedSum(binaryWeighted))
            };
            Logic.sum = function() {
                var things = _.flatten(arguments);
                if (assert) assert(things, isArrayWhere(isFormulaOrTermOrBits));
                var binaryWeighted = [];
                _.each(things, function(x) { if (x instanceof Logic.Bits) { _.each(x.bits, function(b, i) { pushToNth(binaryWeighted, i, b) }) } else { pushToNth(binaryWeighted, 0, x) } });
                return new Logic.Bits(binaryWeightedSum(binaryWeighted))
            };
            Logic.Solver.prototype.solve = function(_assumpVar) {
                var self = this;
                if (_assumpVar !== undefined) { if (!(_assumpVar >= 1)) { throw new Error("_assumpVar must be a variable number") } }
                if (self._unsat) { return null }
                while (self._numClausesAddedToMiniSat < self.clauses.length) {
                    var i = self._numClausesAddedToMiniSat;
                    var terms = self.clauses[i].terms;
                    if (assert) assert(terms, isArrayWhere(Logic.isNumTerm));
                    var stillSat = self._minisat.addClause(terms);
                    self._numClausesAddedToMiniSat++;
                    if (!stillSat) { self._unsat = true; return null }
                }
                if (assert) assert(this._num2name.length - 1, Logic.isWholeNumber);
                self._minisat.ensureVar(this._num2name.length - 1);
                var stillSat = _assumpVar ? self._minisat.solveAssuming(_assumpVar) : self._minisat.solve();
                if (!stillSat) { if (!_assumpVar) { self._unsat = true } return null }
                return new Logic.Solution(self, self._minisat.getSolution())
            };
            Logic.Solver.prototype.solveAssuming = function(formula) {
                if (assert) assert(formula, isFormulaOrTerm);
                var assump = new Logic.Assumption(formula);
                var assumpVar = this._formulaToTerm(assump);
                if (!(typeof assumpVar === "number" && assumpVar > 0)) { throw new Error("Assertion failure: not a positive numeric term") }
                this._useFormulaTerm(assumpVar);
                var result = this.solve(assumpVar);
                this._minisat.retireVar(assumpVar);
                return result
            };
            Logic.Assumption = function(formula) {
                if (assert) assert(formula, isFormulaOrTerm);
                this.formula = formula
            };
            Logic._defineFormula(Logic.Assumption, "assump", { generateClauses: function(isTrue, t) { if (isTrue) { return t.clause(this.formula) } else { return t.clause(Logic.not(this.formula)) } } });
            Logic.Solution = function(_solver, _assignment) {
                var self = this;
                self._solver = _solver;
                self._assignment = _assignment;
                self._ungeneratedFormulas = _.clone(_solver._ungeneratedFormulas);
                self._formulaValueCache = {};
                self._termifier = new Logic.Termifier(self._solver);
                self._termifier.term = function(formula) { return self.evaluate(formula) ? Logic.NUM_TRUE : Logic.NUM_FALSE };
                self._ignoreUnknownVariables = false
            };
            Logic.Solution.prototype.ignoreUnknownVariables = function() { this._ignoreUnknownVariables = true };
            Logic.Solution.prototype.getMap = function() { var solver = this._solver; var assignment = this._assignment; var result = {}; for (var i = 1; i < assignment.length; i++) { var name = solver.getVarName(i); if (name && name.charAt(0) !== "$") { result[name] = assignment[i] } } return result };
            Logic.Solution.prototype.getTrueVars = function() {
                var solver = this._solver;
                var assignment = this._assignment;
                var result = [];
                for (var i = 1; i < assignment.length; i++) { if (assignment[i]) { var name = solver.getVarName(i); if (name && name.charAt(0) !== "$") { result.push(name) } } }
                result.sort();
                return result
            };
            Logic.Solution.prototype.getFormula = function() { var solver = this._solver; var assignment = this._assignment; var terms = []; for (var i = 1; i < assignment.length; i++) { var name = solver.getVarName(i); if (name && name.charAt(0) !== "$") { terms.push(assignment[i] ? i : -i) } } return Logic.and(terms) };
            Logic.Solution.prototype.evaluate = function(formulaOrBits) {
                var self = this;
                if (assert) assert(formulaOrBits, isFormulaOrTermOrBits);
                if (formulaOrBits instanceof Logic.Bits) {
                    var ret = 0;
                    _.each(formulaOrBits.bits, function(f, i) { if (self.evaluate(f)) { ret += 1 << i } });
                    return ret
                }
                var solver = self._solver;
                var ignoreUnknownVariables = self._ignoreUnknownVariables;
                var assignment = self._assignment;
                var formula = formulaOrBits;
                if (formula instanceof Logic.NotFormula) { return !self.evaluate(formula.operand) } else if (formula instanceof Logic.Formula) {
                    var cachedResult = self._formulaValueCache[formula.guid()];
                    if (typeof cachedResult === "boolean") { return cachedResult } else {
                        var value;
                        var info = solver._getFormulaInfo(formula, true);
                        if (info && info.varNum && info.varNum < assignment.length && !_.has(self._ungeneratedFormulas, info.varNum)) { value = assignment[info.varNum] } else { var clauses = solver._generateFormula(true, formula, self._termifier); var value = _.all(clauses, function(cls) { return _.any(cls.terms, function(t) { return self.evaluate(t) }) }) }
                        self._formulaValueCache[formula.guid()] = value;
                        return value
                    }
                } else {
                    var numTerm = solver.toNumTerm(formula, true);
                    if (!numTerm) { if (ignoreUnknownVariables) { return false } else { var vname = String(formula).replace(/^-*/, ""); throw new Error("No such variable: " + vname) } }
                    var v = numTerm;
                    var isNot = false;
                    if (numTerm < 0) {
                        v = -v;
                        isNot = true
                    }
                    if (v < 1 || v >= assignment.length) { var vname = v; if (v >= 1 && v < solver._num2name.length) { vname = solver._num2name[v] } if (ignoreUnknownVariables) { return false } else { throw new Error("Variable not part of solution: " + vname) } }
                    var ret = assignment[v];
                    if (isNot) { ret = !ret }
                    return ret
                }
            };
            Logic.Solution.prototype.getWeightedSum = function(formulas, weights) { checkWeightedSumArgs(formulas, weights); var total = 0; if (typeof weights === "number") { for (var i = 0; i < formulas.length; i++) { total += weights * (this.evaluate(formulas[i]) ? 1 : 0) } } else { for (var i = 0; i < formulas.length; i++) { total += weights[i] * (this.evaluate(formulas[i]) ? 1 : 0) } } return total };
            var getNonZeroWeightedTerms = function(costTerms, costWeights) { if (typeof costWeights === "number") { return costWeights ? costTerms : [] } else { var terms = []; for (var i = 0; i < costTerms.length; i++) { if (costWeights[i]) { terms.push(costTerms[i]) } } return terms } };
            var minMaxWS = function(solver, solution, costTerms, costWeights, options, isMin) {
                var curSolution = solution;
                var curCost = curSolution.getWeightedSum(costTerms, costWeights);
                var optFormula = options && options.formula;
                var weightedSum = optFormula || Logic.weightedSum(costTerms, costWeights);
                var progress = options && options.progress;
                var strategy = options && options.strategy;
                var nonZeroTerms = null;
                if (isMin && curCost > 0) {
                    if (progress) { progress("trying", 0) }
                    var zeroSolution = null;
                    nonZeroTerms = getNonZeroWeightedTerms(costTerms, costWeights);
                    var zeroSolution = solver.solveAssuming(Logic.not(Logic.or(nonZeroTerms)));
                    if (zeroSolution) {
                        curSolution = zeroSolution;
                        curCost = 0
                    }
                }
                if (isMin && strategy === "bottom-up") {
                    for (var trialCost = 1; trialCost < curCost; trialCost++) {
                        if (progress) { progress("trying", trialCost) }
                        var costIsTrialCost = Logic.equalBits(weightedSum, Logic.constantBits(trialCost));
                        var newSolution = solver.solveAssuming(costIsTrialCost);
                        if (newSolution) {
                            curSolution = newSolution;
                            curCost = trialCost;
                            break
                        }
                    }
                } else if (strategy && strategy !== "default") { throw new Error("Bad strategy: " + strategy) } else { strategy = "default" }
                if (strategy === "default") {
                    while (isMin ? curCost > 0 : true) {
                        if (progress) { progress("improving", curCost) }
                        var improvement = (isMin ? Logic.lessThan : Logic.greaterThan)(weightedSum, Logic.constantBits(curCost));
                        var newSolution = solver.solveAssuming(improvement);
                        if (!newSolution) { break }
                        solver.require(improvement);
                        curSolution = newSolution;
                        curCost = curSolution.getWeightedSum(costTerms, costWeights)
                    }
                }
                if (isMin && curCost === 0) {
                    if (!nonZeroTerms) { nonZeroTerms = getNonZeroWeightedTerms(costTerms, costWeights) }
                    solver.forbid(nonZeroTerms)
                } else { solver.require(Logic.equalBits(weightedSum, Logic.constantBits(curCost))) }
                if (progress) { progress("finished", curCost) }
                return curSolution
            };
            Logic.Solver.prototype.minimizeWeightedSum = function(solution, costTerms, costWeights, options) { return minMaxWS(this, solution, costTerms, costWeights, options, true) };
            Logic.Solver.prototype.maximizeWeightedSum = function(solution, costTerms, costWeights, options) { return minMaxWS(this, solution, costTerms, costWeights, options, false) };
            module.exports = Logic
        }, { "./minisat_wrapper.js": 3, underscore: 4 }],
        2: [function(require, module, exports) {
            (function(__dirname) {
                var C_MINISAT;
                C_MINISAT = function() {
                    var module = {};
                    var require = function() {};
                    var process = { argv: ["node", "minisat"], on: function() {}, stdout: { write: function(str) { console.log("MINISAT-out:", str.replace(/\n$/, "")) } }, stderr: { write: function(str) { console.log("MINISAT-err:", str.replace(/\n$/, "")) } } };
                    var window = 0;
                    var Module;
                    if (!Module) Module = (typeof Module !== "undefined" ? Module : null) || {};
                    var moduleOverrides = {};
                    for (var key in Module) { if (Module.hasOwnProperty(key)) { moduleOverrides[key] = Module[key] } }
                    var ENVIRONMENT_IS_NODE = typeof process === "object" && typeof require === "function";
                    var ENVIRONMENT_IS_WEB = typeof window === "object";
                    var ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
                    var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
                    if (ENVIRONMENT_IS_NODE) {
                        if (!Module["print"]) Module["print"] = function print(x) { process["stdout"].write(x + "\n") };
                        if (!Module["printErr"]) Module["printErr"] = function printErr(x) { process["stderr"].write(x + "\n") };
                        var nodeFS = require("fs");
                        var nodePath = require("path");
                        Module["read"] = function read(filename, binary) {
                            filename = nodePath["normalize"](filename);
                            var ret = nodeFS["readFileSync"](filename);
                            if (!ret && filename != nodePath["resolve"](filename)) {
                                filename = path.join(__dirname, "..", "src", filename);
                                ret = nodeFS["readFileSync"](filename)
                            }
                            if (ret && !binary) ret = ret.toString();
                            return ret
                        };
                        Module["readBinary"] = function readBinary(filename) { return Module["read"](filename, true) };
                        Module["load"] = function load(f) { globalEval(read(f)) };
                        if (process["argv"].length > 1) { Module["thisProgram"] = process["argv"][1].replace(/\\/g, "/") } else { Module["thisProgram"] = "unknown-program" }
                        Module["arguments"] = process["argv"].slice(2);
                        if (typeof module !== "undefined") { module["exports"] = Module }
                        process["on"]("uncaughtException", function(ex) { if (!(ex instanceof ExitStatus)) { throw ex } })
                    } else if (ENVIRONMENT_IS_SHELL) {
                        if (!Module["print"]) Module["print"] = print;
                        if (typeof printErr != "undefined") Module["printErr"] = printErr;
                        if (typeof read != "undefined") { Module["read"] = read } else { Module["read"] = function read() { throw "no read() available (jsc?)" } }
                        Module["readBinary"] = function readBinary(f) {
                            if (typeof readbuffer === "function") { return new Uint8Array(readbuffer(f)) }
                            var data = read(f, "binary");
                            assert(typeof data === "object");
                            return data
                        };
                        if (typeof scriptArgs != "undefined") { Module["arguments"] = scriptArgs } else if (typeof arguments != "undefined") { Module["arguments"] = arguments }
                        this["Module"] = Module
                    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
                        Module["read"] = function read(url) {
                            var xhr = new XMLHttpRequest;
                            xhr.open("GET", url, false);
                            xhr.send(null);
                            return xhr.responseText
                        };
                        if (typeof arguments != "undefined") { Module["arguments"] = arguments }
                        if (typeof console !== "undefined") { if (!Module["print"]) Module["print"] = function print(x) { console.log(x) }; if (!Module["printErr"]) Module["printErr"] = function printErr(x) { console.log(x) } } else { var TRY_USE_DUMP = false; if (!Module["print"]) Module["print"] = TRY_USE_DUMP && typeof dump !== "undefined" ? function(x) { dump(x) } : function(x) {} }
                        if (ENVIRONMENT_IS_WEB) { window["Module"] = Module } else { Module["load"] = importScripts }
                    } else { throw "Unknown runtime environment. Where are we?" }

                    function globalEval(x) { eval.call(null, x) }
                    if (!Module["load"] && Module["read"]) { Module["load"] = function load(f) { globalEval(Module["read"](f)) } }
                    if (!Module["print"]) { Module["print"] = function() {} }
                    if (!Module["printErr"]) { Module["printErr"] = Module["print"] }
                    if (!Module["arguments"]) { Module["arguments"] = [] }
                    if (!Module["thisProgram"]) { Module["thisProgram"] = "./this.program" }
                    Module.print = Module["print"];
                    Module.printErr = Module["printErr"];
                    Module["preRun"] = [];
                    Module["postRun"] = [];
                    for (var key in moduleOverrides) { if (moduleOverrides.hasOwnProperty(key)) { Module[key] = moduleOverrides[key] } }
                    var Runtime = {
                        setTempRet0: function(value) { tempRet0 = value },
                        getTempRet0: function() { return tempRet0 },
                        stackSave: function() { return STACKTOP },
                        stackRestore: function(stackTop) { STACKTOP = stackTop },
                        getNativeTypeSize: function(type) {
                            switch (type) {
                                case "i1":
                                case "i8":
                                    return 1;
                                case "i16":
                                    return 2;
                                case "i32":
                                    return 4;
                                case "i64":
                                    return 8;
                                case "float":
                                    return 4;
                                case "double":
                                    return 8;
                                default:
                                    {
                                        if (type[type.length - 1] === "*") { return Runtime.QUANTUM_SIZE } else if (type[0] === "i") {
                                            var bits = parseInt(type.substr(1));
                                            assert(bits % 8 === 0);
                                            return bits / 8
                                        } else { return 0 }
                                    }
                            }
                        },
                        getNativeFieldSize: function(type) { return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE) },
                        STACK_ALIGN: 16,
                        getAlignSize: function(type, size, vararg) { if (!vararg && (type == "i64" || type == "double")) return 8; if (!type) return Math.min(size, 8); return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE) },
                        dynCall: function(sig, ptr, args) {
                            if (args && args.length) {
                                if (!args.splice) args = Array.prototype.slice.call(args);
                                args.splice(0, 0, ptr);
                                return Module["dynCall_" + sig].apply(null, args)
                            } else { return Module["dynCall_" + sig].call(null, ptr) }
                        },
                        functionPointers: [],
                        addFunction: function(func) { for (var i = 0; i < Runtime.functionPointers.length; i++) { if (!Runtime.functionPointers[i]) { Runtime.functionPointers[i] = func; return 2 * (1 + i) } } throw "Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS." },
                        removeFunction: function(index) { Runtime.functionPointers[(index - 2) / 2] = null },
                        getAsmConst: function(code, numArgs) { if (!Runtime.asmConstCache) Runtime.asmConstCache = {}; var func = Runtime.asmConstCache[code]; if (func) return func; var args = []; for (var i = 0; i < numArgs; i++) { args.push(String.fromCharCode(36) + i) } var source = Pointer_stringify(code); if (source[0] === '"') { if (source.indexOf('"', 1) === source.length - 1) { source = source.substr(1, source.length - 2) } else { abort("invalid EM_ASM input |" + source + "|. Please use EM_ASM(..code..) (no quotes) or EM_ASM({ ..code($0).. }, input) (to input values)") } } try { var evalled = eval("(function(Module, FS) { return function(" + args.join(",") + "){ " + source + " } })")(Module, typeof FS !== "undefined" ? FS : null) } catch (e) { Module.printErr("error in executing inline EM_ASM code: " + e + " on: \n\n" + source + "\n\nwith args |" + args + "| (make sure to use the right one out of EM_ASM, EM_ASM_ARGS, etc.)"); throw e } return Runtime.asmConstCache[code] = evalled },
                        warnOnce: function(text) {
                            if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
                            if (!Runtime.warnOnce.shown[text]) {
                                Runtime.warnOnce.shown[text] = 1;
                                Module.printErr(text)
                            }
                        },
                        funcWrappers: {},
                        getFuncWrapper: function(func, sig) { assert(sig); if (!Runtime.funcWrappers[sig]) { Runtime.funcWrappers[sig] = {} } var sigCache = Runtime.funcWrappers[sig]; if (!sigCache[func]) { sigCache[func] = function dynCall_wrapper() { return Runtime.dynCall(sig, func, arguments) } } return sigCache[func] },
                        UTF8Processor: function() {
                            var buffer = [];
                            var needed = 0;
                            this.processCChar = function(code) {
                                code = code & 255;
                                if (buffer.length == 0) {
                                    if ((code & 128) == 0) { return String.fromCharCode(code) }
                                    buffer.push(code);
                                    if ((code & 224) == 192) { needed = 1 } else if ((code & 240) == 224) { needed = 2 } else { needed = 3 }
                                    return ""
                                }
                                if (needed) {
                                    buffer.push(code);
                                    needed--;
                                    if (needed > 0) return ""
                                }
                                var c1 = buffer[0];
                                var c2 = buffer[1];
                                var c3 = buffer[2];
                                var c4 = buffer[3];
                                var ret;
                                if (buffer.length == 2) { ret = String.fromCharCode((c1 & 31) << 6 | c2 & 63) } else if (buffer.length == 3) { ret = String.fromCharCode((c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63) } else {
                                    var codePoint = (c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63;
                                    ret = String.fromCharCode(((codePoint - 65536) / 1024 | 0) + 55296, (codePoint - 65536) % 1024 + 56320)
                                }
                                buffer.length = 0;
                                return ret
                            };
                            this.processJSString = function processJSString(string) { string = unescape(encodeURIComponent(string)); var ret = []; for (var i = 0; i < string.length; i++) { ret.push(string.charCodeAt(i)) } return ret }
                        },
                        getCompilerSetting: function(name) { throw "You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work" },
                        stackAlloc: function(size) {
                            var ret = STACKTOP;
                            STACKTOP = STACKTOP + size | 0;
                            STACKTOP = STACKTOP + 15 & -16;
                            return ret
                        },
                        staticAlloc: function(size) {
                            var ret = STATICTOP;
                            STATICTOP = STATICTOP + size | 0;
                            STATICTOP = STATICTOP + 15 & -16;
                            return ret
                        },
                        dynamicAlloc: function(size) {
                            var ret = DYNAMICTOP;
                            DYNAMICTOP = DYNAMICTOP + size | 0;
                            DYNAMICTOP = DYNAMICTOP + 15 & -16;
                            if (DYNAMICTOP >= TOTAL_MEMORY) enlargeMemory();
                            return ret
                        },
                        alignMemory: function(size, quantum) { var ret = size = Math.ceil(size / (quantum ? quantum : 16)) * (quantum ? quantum : 16); return ret },
                        makeBigInt: function(low, high, unsigned) { var ret = unsigned ? +(low >>> 0) + +(high >>> 0) * +4294967296 : +(low >>> 0) + +(high | 0) * +4294967296; return ret },
                        GLOBAL_BASE: 8,
                        QUANTUM_SIZE: 4,
                        __dummy__: 0
                    };
                    Module["Runtime"] = Runtime;
                    var __THREW__ = 0;
                    var ABORT = false;
                    var EXITSTATUS = 0;
                    var undef = 0;
                    var tempValue, tempInt, tempBigInt, tempInt2, tempBigInt2, tempPair, tempBigIntI, tempBigIntR, tempBigIntS, tempBigIntP, tempBigIntD, tempDouble, tempFloat;
                    var tempI64, tempI64b;
                    var tempRet0, tempRet1, tempRet2, tempRet3, tempRet4, tempRet5, tempRet6, tempRet7, tempRet8, tempRet9;

                    function assert(condition, text) { if (!condition) { abort("Assertion failed: " + text) } }
                    var globalScope = this;

                    function getCFunc(ident) {
                        var func = Module["_" + ident];
                        if (!func) { try { func = eval("_" + ident) } catch (e) {} }
                        assert(func, "Cannot call unknown function " + ident + " (perhaps LLVM optimizations or closure removed it?)");
                        return func
                    }
                    var cwrap, ccall;
                    (function() {
                        var JSfuncs = {
                            stackSave: function() { Runtime.stackSave() },
                            stackRestore: function() { Runtime.stackRestore() },
                            arrayToC: function(arr) {
                                var ret = Runtime.stackAlloc(arr.length);
                                writeArrayToMemory(arr, ret);
                                return ret
                            },
                            stringToC: function(str) {
                                var ret = 0;
                                if (str !== null && str !== undefined && str !== 0) {
                                    ret = Runtime.stackAlloc((str.length << 2) + 1);
                                    writeStringToMemory(str, ret)
                                }
                                return ret
                            }
                        };
                        var toC = { string: JSfuncs["stringToC"], array: JSfuncs["arrayToC"] };
                        ccall = function ccallFunc(ident, returnType, argTypes, args) {
                            var func = getCFunc(ident);
                            var cArgs = [];
                            var stack = 0;
                            if (args) {
                                for (var i = 0; i < args.length; i++) {
                                    var converter = toC[argTypes[i]];
                                    if (converter) {
                                        if (stack === 0) stack = Runtime.stackSave();
                                        cArgs[i] = converter(args[i])
                                    } else { cArgs[i] = args[i] }
                                }
                            }
                            var ret = func.apply(null, cArgs);
                            if (returnType === "string") ret = Pointer_stringify(ret);
                            if (stack !== 0) Runtime.stackRestore(stack);
                            return ret
                        };
                        var sourceRegex = /^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;

                        function parseJSFunc(jsfunc) { var parsed = jsfunc.toString().match(sourceRegex).slice(1); return { arguments: parsed[0], body: parsed[1], returnValue: parsed[2] } }
                        var JSsource = {};
                        for (var fun in JSfuncs) { if (JSfuncs.hasOwnProperty(fun)) { JSsource[fun] = parseJSFunc(JSfuncs[fun]) } }
                        cwrap = function cwrap(ident, returnType, argTypes) {
                            argTypes = argTypes || [];
                            var cfunc = getCFunc(ident);
                            var numericArgs = argTypes.every(function(type) { return type === "number" });
                            var numericRet = returnType !== "string";
                            if (numericRet && numericArgs) { return cfunc }
                            var argNames = argTypes.map(function(x, i) { return "$" + i });
                            var funcstr = "(function(" + argNames.join(",") + ") {";
                            var nargs = argTypes.length;
                            if (!numericArgs) {
                                funcstr += "var stack = " + JSsource["stackSave"].body + ";";
                                for (var i = 0; i < nargs; i++) {
                                    var arg = argNames[i],
                                        type = argTypes[i];
                                    if (type === "number") continue;
                                    var convertCode = JSsource[type + "ToC"];
                                    funcstr += "var " + convertCode.arguments + " = " + arg + ";";
                                    funcstr += convertCode.body + ";";
                                    funcstr += arg + "=" + convertCode.returnValue + ";"
                                }
                            }
                            var cfuncname = parseJSFunc(function() { return cfunc }).returnValue;
                            funcstr += "var ret = " + cfuncname + "(" + argNames.join(",") + ");";
                            if (!numericRet) {
                                var strgfy = parseJSFunc(function() { return Pointer_stringify }).returnValue;
                                funcstr += "ret = " + strgfy + "(ret);"
                            }
                            if (!numericArgs) { funcstr += JSsource["stackRestore"].body.replace("()", "(stack)") + ";" }
                            funcstr += "return ret})";
                            return eval(funcstr)
                        }
                    })();
                    Module["cwrap"] = cwrap;
                    Module["ccall"] = ccall;

                    function setValue(ptr, value, type, noSafe) {
                        type = type || "i8";
                        if (type.charAt(type.length - 1) === "*") type = "i32";
                        switch (type) {
                            case "i1":
                                HEAP8[ptr >> 0] = value;
                                break;
                            case "i8":
                                HEAP8[ptr >> 0] = value;
                                break;
                            case "i16":
                                HEAP16[ptr >> 1] = value;
                                break;
                            case "i32":
                                HEAP32[ptr >> 2] = value;
                                break;
                            case "i64":
                                tempI64 = [value >>> 0, (tempDouble = value, +Math_abs(tempDouble) >= +1 ? tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0 : 0)], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
                                break;
                            case "float":
                                HEAPF32[ptr >> 2] = value;
                                break;
                            case "double":
                                HEAPF64[ptr >> 3] = value;
                                break;
                            default:
                                abort("invalid type for setValue: " + type)
                        }
                    }
                    Module["setValue"] = setValue;

                    function getValue(ptr, type, noSafe) {
                        type = type || "i8";
                        if (type.charAt(type.length - 1) === "*") type = "i32";
                        switch (type) {
                            case "i1":
                                return HEAP8[ptr >> 0];
                            case "i8":
                                return HEAP8[ptr >> 0];
                            case "i16":
                                return HEAP16[ptr >> 1];
                            case "i32":
                                return HEAP32[ptr >> 2];
                            case "i64":
                                return HEAP32[ptr >> 2];
                            case "float":
                                return HEAPF32[ptr >> 2];
                            case "double":
                                return HEAPF64[ptr >> 3];
                            default:
                                abort("invalid type for setValue: " + type)
                        }
                        return null
                    }
                    Module["getValue"] = getValue;
                    var ALLOC_NORMAL = 0;
                    var ALLOC_STACK = 1;
                    var ALLOC_STATIC = 2;
                    var ALLOC_DYNAMIC = 3;
                    var ALLOC_NONE = 4;
                    Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
                    Module["ALLOC_STACK"] = ALLOC_STACK;
                    Module["ALLOC_STATIC"] = ALLOC_STATIC;
                    Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
                    Module["ALLOC_NONE"] = ALLOC_NONE;

                    function allocate(slab, types, allocator, ptr) {
                        var zeroinit, size;
                        if (typeof slab === "number") {
                            zeroinit = true;
                            size = slab
                        } else {
                            zeroinit = false;
                            size = slab.length
                        }
                        var singleType = typeof types === "string" ? types : null;
                        var ret;
                        if (allocator == ALLOC_NONE) { ret = ptr } else { ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length)) }
                        if (zeroinit) {
                            var ptr = ret,
                                stop;
                            assert((ret & 3) == 0);
                            stop = ret + (size & ~3);
                            for (; ptr < stop; ptr += 4) { HEAP32[ptr >> 2] = 0 }
                            stop = ret + size;
                            while (ptr < stop) { HEAP8[ptr++ >> 0] = 0 }
                            return ret
                        }
                        if (singleType === "i8") { if (slab.subarray || slab.slice) { HEAPU8.set(slab, ret) } else { HEAPU8.set(new Uint8Array(slab), ret) } return ret }
                        var i = 0,
                            type, typeSize, previousType;
                        while (i < size) {
                            var curr = slab[i];
                            if (typeof curr === "function") { curr = Runtime.getFunctionIndex(curr) }
                            type = singleType || types[i];
                            if (type === 0) { i++; continue }
                            if (type == "i64") type = "i32";
                            setValue(ret + i, curr, type);
                            if (previousType !== type) {
                                typeSize = Runtime.getNativeTypeSize(type);
                                previousType = type
                            }
                            i += typeSize
                        }
                        return ret
                    }
                    Module["allocate"] = allocate;

                    function Pointer_stringify(ptr, length) {
                        if (length === 0 || !ptr) return "";
                        var hasUtf = false;
                        var t;
                        var i = 0;
                        while (1) {
                            t = HEAPU8[ptr + i >> 0];
                            if (t >= 128) hasUtf = true;
                            else if (t == 0 && !length) break;
                            i++;
                            if (length && i == length) break
                        }
                        if (!length) length = i;
                        var ret = "";
                        if (!hasUtf) {
                            var MAX_CHUNK = 1024;
                            var curr;
                            while (length > 0) {
                                curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
                                ret = ret ? ret + curr : curr;
                                ptr += MAX_CHUNK;
                                length -= MAX_CHUNK
                            }
                            return ret
                        }
                        var utf8 = new Runtime.UTF8Processor;
                        for (i = 0; i < length; i++) {
                            t = HEAPU8[ptr + i >> 0];
                            ret += utf8.processCChar(t)
                        }
                        return ret
                    }
                    Module["Pointer_stringify"] = Pointer_stringify;

                    function UTF16ToString(ptr) {
                        var i = 0;
                        var str = "";
                        while (1) {
                            var codeUnit = HEAP16[ptr + i * 2 >> 1];
                            if (codeUnit == 0) return str;
                            ++i;
                            str += String.fromCharCode(codeUnit)
                        }
                    }
                    Module["UTF16ToString"] = UTF16ToString;

                    function stringToUTF16(str, outPtr) {
                        for (var i = 0; i < str.length; ++i) {
                            var codeUnit = str.charCodeAt(i);
                            HEAP16[outPtr + i * 2 >> 1] = codeUnit
                        }
                        HEAP16[outPtr + str.length * 2 >> 1] = 0
                    }
                    Module["stringToUTF16"] = stringToUTF16;

                    function UTF32ToString(ptr) {
                        var i = 0;
                        var str = "";
                        while (1) {
                            var utf32 = HEAP32[ptr + i * 4 >> 2];
                            if (utf32 == 0) return str;
                            ++i;
                            if (utf32 >= 65536) {
                                var ch = utf32 - 65536;
                                str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
                            } else { str += String.fromCharCode(utf32) }
                        }
                    }
                    Module["UTF32ToString"] = UTF32ToString;

                    function stringToUTF32(str, outPtr) {
                        var iChar = 0;
                        for (var iCodeUnit = 0; iCodeUnit < str.length; ++iCodeUnit) {
                            var codeUnit = str.charCodeAt(iCodeUnit);
                            if (codeUnit >= 55296 && codeUnit <= 57343) {
                                var trailSurrogate = str.charCodeAt(++iCodeUnit);
                                codeUnit = 65536 + ((codeUnit & 1023) << 10) | trailSurrogate & 1023
                            }
                            HEAP32[outPtr + iChar * 4 >> 2] = codeUnit;
                            ++iChar
                        }
                        HEAP32[outPtr + iChar * 4 >> 2] = 0
                    }
                    Module["stringToUTF32"] = stringToUTF32;

                    function demangle(func) {
                        var hasLibcxxabi = !!Module["___cxa_demangle"];
                        if (hasLibcxxabi) {
                            try {
                                var buf = _malloc(func.length);
                                writeStringToMemory(func.substr(1), buf);
                                var status = _malloc(4);
                                var ret = Module["___cxa_demangle"](buf, 0, 0, status);
                                if (getValue(status, "i32") === 0 && ret) { return Pointer_stringify(ret) }
                            } catch (e) {} finally { if (buf) _free(buf); if (status) _free(status); if (ret) _free(ret) }
                        }
                        var i = 3;
                        var basicTypes = { v: "void", b: "bool", c: "char", s: "short", i: "int", l: "long", f: "float", d: "double", w: "wchar_t", a: "signed char", h: "unsigned char", t: "unsigned short", j: "unsigned int", m: "unsigned long", x: "long long", y: "unsigned long long", z: "..." };
                        var subs = [];
                        var first = true;

                        function dump(x) {
                            if (x) Module.print(x);
                            Module.print(func);
                            var pre = "";
                            for (var a = 0; a < i; a++) pre += " ";
                            Module.print(pre + "^")
                        }

                        function parseNested() {
                            i++;
                            if (func[i] === "K") i++;
                            var parts = [];
                            while (func[i] !== "E") {
                                if (func[i] === "S") {
                                    i++;
                                    var next = func.indexOf("_", i);
                                    var num = func.substring(i, next) || 0;
                                    parts.push(subs[num] || "?");
                                    i = next + 1;
                                    continue
                                }
                                if (func[i] === "C") {
                                    parts.push(parts[parts.length - 1]);
                                    i += 2;
                                    continue
                                }
                                var size = parseInt(func.substr(i));
                                var pre = size.toString().length;
                                if (!size || !pre) { i--; break }
                                var curr = func.substr(i + pre, size);
                                parts.push(curr);
                                subs.push(curr);
                                i += pre + size
                            }
                            i++;
                            return parts
                        }

                        function parse(rawList, limit, allowVoid) {
                            limit = limit || Infinity;
                            var ret = "",
                                list = [];

                            function flushList() { return "(" + list.join(", ") + ")" }
                            var name;
                            if (func[i] === "N") {
                                name = parseNested().join("::");
                                limit--;
                                if (limit === 0) return rawList ? [name] : name
                            } else {
                                if (func[i] === "K" || first && func[i] === "L") i++;
                                var size = parseInt(func.substr(i));
                                if (size) {
                                    var pre = size.toString().length;
                                    name = func.substr(i + pre, size);
                                    i += pre + size
                                }
                            }
                            first = false;
                            if (func[i] === "I") {
                                i++;
                                var iList = parse(true);
                                var iRet = parse(true, 1, true);
                                ret += iRet[0] + " " + name + "<" + iList.join(", ") + ">"
                            } else { ret = name }
                            paramLoop: while (i < func.length && limit-- > 0) {
                                var c = func[i++];
                                if (c in basicTypes) { list.push(basicTypes[c]) } else {
                                    switch (c) {
                                        case "P":
                                            list.push(parse(true, 1, true)[0] + "*");
                                            break;
                                        case "R":
                                            list.push(parse(true, 1, true)[0] + "&");
                                            break;
                                        case "L":
                                            { i++; var end = func.indexOf("E", i); var size = end - i;list.push(func.substr(i, size));i += size + 2; break };
                                        case "A":
                                            { var size = parseInt(func.substr(i));i += size.toString().length; if (func[i] !== "_") throw "?";i++;list.push(parse(true, 1, true)[0] + " [" + size + "]"); break };
                                        case "E":
                                            break paramLoop;
                                        default:
                                            ret += "?" + c;
                                            break paramLoop
                                    }
                                }
                            }
                            if (!allowVoid && list.length === 1 && list[0] === "void") list = [];
                            if (rawList) { if (ret) { list.push(ret + "?") } return list } else { return ret + flushList() }
                        }
                        var parsed = func;
                        try {
                            if (func == "Object._main" || func == "_main") { return "main()" }
                            if (typeof func === "number") func = Pointer_stringify(func);
                            if (func[0] !== "_") return func;
                            if (func[1] !== "_") return func;
                            if (func[2] !== "Z") return func;
                            switch (func[3]) {
                                case "n":
                                    return "operator new()";
                                case "d":
                                    return "operator delete()"
                            }
                            parsed = parse()
                        } catch (e) { parsed += "?" }
                        if (parsed.indexOf("?") >= 0 && !hasLibcxxabi) { Runtime.warnOnce("warning: a problem occurred in builtin C++ name demangling; build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling") }
                        return parsed
                    }

                    function demangleAll(text) { return text.replace(/__Z[\w\d_]+/g, function(x) { var y = demangle(x); return x === y ? x : x + " [" + y + "]" }) }

                    function jsStackTrace() { var err = new Error; if (!err.stack) { try { throw new Error(0) } catch (e) { err = e } if (!err.stack) { return "(no stack trace available)" } } return err.stack.toString() }

                    function stackTrace() { return demangleAll(jsStackTrace()) }
                    Module["stackTrace"] = stackTrace;
                    var PAGE_SIZE = 4096;

                    function alignMemoryPage(x) { return x + 4095 & -4096 }
                    var HEAP;
                    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
                    var STATIC_BASE = 0,
                        STATICTOP = 0,
                        staticSealed = false;
                    var STACK_BASE = 0,
                        STACKTOP = 0,
                        STACK_MAX = 0;
                    var DYNAMIC_BASE = 0,
                        DYNAMICTOP = 0;

                    function enlargeMemory() { abort("Cannot enlarge memory arrays. Either (1) compile with -s TOTAL_MEMORY=X with X higher than the current value " + TOTAL_MEMORY + ", (2) compile with ALLOW_MEMORY_GROWTH which adjusts the size at runtime but prevents some optimizations, or (3) set Module.TOTAL_MEMORY before the program runs.") }
                    var TOTAL_STACK = Module["TOTAL_STACK"] || 5242880;
                    var TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 67108864;
                    var FAST_MEMORY = Module["FAST_MEMORY"] || 2097152;
                    var totalMemory = 64 * 1024;
                    while (totalMemory < TOTAL_MEMORY || totalMemory < 2 * TOTAL_STACK) { if (totalMemory < 16 * 1024 * 1024) { totalMemory *= 2 } else { totalMemory += 16 * 1024 * 1024 } }
                    if (totalMemory !== TOTAL_MEMORY) {
                        Module.printErr("increasing TOTAL_MEMORY to " + totalMemory + " to be compliant with the asm.js spec");
                        TOTAL_MEMORY = totalMemory
                    }
                    assert(typeof Int32Array !== "undefined" && typeof Float64Array !== "undefined" && !!new Int32Array(1)["subarray"] && !!new Int32Array(1)["set"], "JS engine does not provide full typed array support");
                    var buffer = new ArrayBuffer(TOTAL_MEMORY);
                    HEAP8 = new Int8Array(buffer);
                    HEAP16 = new Int16Array(buffer);
                    HEAP32 = new Int32Array(buffer);
                    HEAPU8 = new Uint8Array(buffer);
                    HEAPU16 = new Uint16Array(buffer);
                    HEAPU32 = new Uint32Array(buffer);
                    HEAPF32 = new Float32Array(buffer);
                    HEAPF64 = new Float64Array(buffer);
                    HEAP32[0] = 255;
                    assert(HEAPU8[0] === 255 && HEAPU8[3] === 0, "Typed arrays 2 must be run on a little-endian system");
                    Module["HEAP"] = HEAP;
                    Module["buffer"] = buffer;
                    Module["HEAP8"] = HEAP8;
                    Module["HEAP16"] = HEAP16;
                    Module["HEAP32"] = HEAP32;
                    Module["HEAPU8"] = HEAPU8;
                    Module["HEAPU16"] = HEAPU16;
                    Module["HEAPU32"] = HEAPU32;
                    Module["HEAPF32"] = HEAPF32;
                    Module["HEAPF64"] = HEAPF64;

                    function callRuntimeCallbacks(callbacks) { while (callbacks.length > 0) { var callback = callbacks.shift(); if (typeof callback == "function") { callback(); continue } var func = callback.func; if (typeof func === "number") { if (callback.arg === undefined) { Runtime.dynCall("v", func) } else { Runtime.dynCall("vi", func, [callback.arg]) } } else { func(callback.arg === undefined ? null : callback.arg) } } }
                    var __ATPRERUN__ = [];
                    var __ATINIT__ = [];
                    var __ATMAIN__ = [];
                    var __ATEXIT__ = [];
                    var __ATPOSTRUN__ = [];
                    var runtimeInitialized = false;
                    var runtimeExited = false;

                    function preRun() {
                        if (Module["preRun"]) { if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]]; while (Module["preRun"].length) { addOnPreRun(Module["preRun"].shift()) } }
                        callRuntimeCallbacks(__ATPRERUN__)
                    }

                    function ensureInitRuntime() {
                        if (runtimeInitialized) return;
                        runtimeInitialized = true;
                        callRuntimeCallbacks(__ATINIT__)
                    }

                    function preMain() { callRuntimeCallbacks(__ATMAIN__) }

                    function exitRuntime() {
                        callRuntimeCallbacks(__ATEXIT__);
                        runtimeExited = true
                    }

                    function postRun() {
                        if (Module["postRun"]) { if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]]; while (Module["postRun"].length) { addOnPostRun(Module["postRun"].shift()) } }
                        callRuntimeCallbacks(__ATPOSTRUN__)
                    }

                    function addOnPreRun(cb) { __ATPRERUN__.unshift(cb) }
                    Module["addOnPreRun"] = Module.addOnPreRun = addOnPreRun;

                    function addOnInit(cb) { __ATINIT__.unshift(cb) }
                    Module["addOnInit"] = Module.addOnInit = addOnInit;

                    function addOnPreMain(cb) { __ATMAIN__.unshift(cb) }
                    Module["addOnPreMain"] = Module.addOnPreMain = addOnPreMain;

                    function addOnExit(cb) { __ATEXIT__.unshift(cb) }
                    Module["addOnExit"] = Module.addOnExit = addOnExit;

                    function addOnPostRun(cb) { __ATPOSTRUN__.unshift(cb) }
                    Module["addOnPostRun"] = Module.addOnPostRun = addOnPostRun;

                    function intArrayFromString(stringy, dontAddNull, length) { var ret = (new Runtime.UTF8Processor).processJSString(stringy); if (length) { ret.length = length } if (!dontAddNull) { ret.push(0) } return ret }
                    Module["intArrayFromString"] = intArrayFromString;

                    function intArrayToString(array) {
                        var ret = [];
                        for (var i = 0; i < array.length; i++) {
                            var chr = array[i];
                            if (chr > 255) { chr &= 255 }
                            ret.push(String.fromCharCode(chr))
                        }
                        return ret.join("")
                    }
                    Module["intArrayToString"] = intArrayToString;

                    function writeStringToMemory(string, buffer, dontAddNull) {
                        var array = intArrayFromString(string, dontAddNull);
                        var i = 0;
                        while (i < array.length) {
                            var chr = array[i];
                            HEAP8[buffer + i >> 0] = chr;
                            i = i + 1
                        }
                    }
                    Module["writeStringToMemory"] = writeStringToMemory;

                    function writeArrayToMemory(array, buffer) { for (var i = 0; i < array.length; i++) { HEAP8[buffer + i >> 0] = array[i] } }
                    Module["writeArrayToMemory"] = writeArrayToMemory;

                    function writeAsciiToMemory(str, buffer, dontAddNull) { for (var i = 0; i < str.length; i++) { HEAP8[buffer + i >> 0] = str.charCodeAt(i) } if (!dontAddNull) HEAP8[buffer + str.length >> 0] = 0 }
                    Module["writeAsciiToMemory"] = writeAsciiToMemory;

                    function unSign(value, bits, ignore) { if (value >= 0) { return value } return bits <= 32 ? 2 * Math.abs(1 << bits - 1) + value : Math.pow(2, bits) + value }

                    function reSign(value, bits, ignore) { if (value <= 0) { return value } var half = bits <= 32 ? Math.abs(1 << bits - 1) : Math.pow(2, bits - 1); if (value >= half && (bits <= 32 || value > half)) { value = -2 * half + value } return value }
                    if (!Math["imul"] || Math["imul"](4294967295, 5) !== -5) Math["imul"] = function imul(a, b) { var ah = a >>> 16; var al = a & 65535; var bh = b >>> 16; var bl = b & 65535; return al * bl + (ah * bl + al * bh << 16) | 0 };
                    Math.imul = Math["imul"];
                    var Math_abs = Math.abs;
                    var Math_cos = Math.cos;
                    var Math_sin = Math.sin;
                    var Math_tan = Math.tan;
                    var Math_acos = Math.acos;
                    var Math_asin = Math.asin;
                    var Math_atan = Math.atan;
                    var Math_atan2 = Math.atan2;
                    var Math_exp = Math.exp;
                    var Math_log = Math.log;
                    var Math_sqrt = Math.sqrt;
                    var Math_ceil = Math.ceil;
                    var Math_floor = Math.floor;
                    var Math_pow = Math.pow;
                    var Math_imul = Math.imul;
                    var Math_fround = Math.fround;
                    var Math_min = Math.min;
                    var runDependencies = 0;
                    var runDependencyWatcher = null;
                    var dependenciesFulfilled = null;

                    function addRunDependency(id) { runDependencies++; if (Module["monitorRunDependencies"]) { Module["monitorRunDependencies"](runDependencies) } }
                    Module["addRunDependency"] = addRunDependency;

                    function removeRunDependency(id) {
                        runDependencies--;
                        if (Module["monitorRunDependencies"]) { Module["monitorRunDependencies"](runDependencies) }
                        if (runDependencies == 0) {
                            if (runDependencyWatcher !== null) {
                                clearInterval(runDependencyWatcher);
                                runDependencyWatcher = null
                            }
                            if (dependenciesFulfilled) {
                                var callback = dependenciesFulfilled;
                                dependenciesFulfilled = null;
                                callback()
                            }
                        }
                    }
                    Module["removeRunDependency"] = removeRunDependency;
                    Module["preloadedImages"] = {};
                    Module["preloadedAudios"] = {};
                    var memoryInitializer = null;
                    STATIC_BASE = 8;
                    STATICTOP = STATIC_BASE + 5664;
                    __ATINIT__.push({ func: function() { __GLOBAL__I_a() } }, { func: function() { __GLOBAL__I_a127() } });
                    allocate([78, 55, 77, 105, 110, 105, 115, 97, 116, 50, 48, 79, 117, 116, 79, 102, 77, 101, 109, 111, 114, 121, 69, 120, 99, 101, 112, 116, 105, 111, 110, 69, 0, 0, 0, 0, 0, 0, 0, 0, 88, 18, 0, 0, 8, 0, 0, 0, 78, 55, 77, 105, 110, 105, 115, 97, 116, 54, 79, 112, 116, 105, 111, 110, 69, 0, 0, 0, 0, 0, 0, 0, 88, 18, 0, 0, 56, 0, 0, 0, 10, 32, 32, 32, 32, 32, 32, 32, 32, 37, 115, 10, 0, 0, 0, 0, 0, 0, 0, 0, 80, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 78, 55, 77, 105, 110, 105, 115, 97, 116, 49, 48, 66, 111, 111, 108, 79, 112, 116, 105, 111, 110, 69, 0, 0, 128, 18, 0, 0, 176, 0, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 32, 32, 45, 37, 115, 44, 32, 45, 110, 111, 45, 37, 115, 0, 0, 0, 40, 100, 101, 102, 97, 117, 108, 116, 58, 32, 37, 115, 41, 10, 0, 0, 111, 110, 0, 0, 0, 0, 0, 0, 111, 102, 102, 0, 0, 0, 0, 0, 110, 111, 45, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 1, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 78, 55, 77, 105, 110, 105, 115, 97, 116, 57, 73, 110, 116, 79, 112, 116, 105, 111, 110, 69, 0, 0, 0, 0, 128, 18, 0, 0, 40, 1, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 32, 32, 45, 37, 45, 49, 50, 115, 32, 61, 32, 37, 45, 56, 115, 32, 91, 0, 0, 0, 0, 0, 0, 0, 105, 109, 105, 110, 0, 0, 0, 0, 37, 52, 100, 0, 0, 0, 0, 0, 32, 46, 46, 32, 0, 0, 0, 0, 105, 109, 97, 120, 0, 0, 0, 0, 93, 32, 40, 100, 101, 102, 97, 117, 108, 116, 58, 32, 37, 100, 41, 10, 0, 0, 0, 0, 0, 0, 0, 0, 69, 82, 82, 79, 82, 33, 32, 118, 97, 108, 117, 101, 32, 60, 37, 115, 62, 32, 105, 115, 32, 116, 111, 111, 32, 108, 97, 114, 103, 101, 32, 102, 111, 114, 32, 111, 112, 116, 105, 111, 110, 32, 34, 37, 115, 34, 46, 10, 0, 0, 0, 0, 0, 0, 0, 0, 69, 82, 82, 79, 82, 33, 32, 118, 97, 108, 117, 101, 32, 60, 37, 115, 62, 32, 105, 115, 32, 116, 111, 111, 32, 115, 109, 97, 108, 108, 32, 102, 111, 114, 32, 111, 112, 116, 105, 111, 110, 32, 34, 37, 115, 34, 46, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 118, 97, 114, 45, 100, 101, 99, 97, 121, 0, 0, 0, 0, 0, 0, 0, 84, 104, 101, 32, 118, 97, 114, 105, 97, 98, 108, 101, 32, 97, 99, 116, 105, 118, 105, 116, 121, 32, 100, 101, 99, 97, 121, 32, 102, 97, 99, 116, 111, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99, 108, 97, 45, 100, 101, 99, 97, 121, 0, 0, 0, 0, 0, 0, 0, 84, 104, 101, 32, 99, 108, 97, 117, 115, 101, 32, 97, 99, 116, 105, 118, 105, 116, 121, 32, 100, 101, 99, 97, 121, 32, 102, 97, 99, 116, 111, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 110, 100, 45, 102, 114, 101, 113, 0, 0, 0, 0, 0, 0, 0, 0, 84, 104, 101, 32, 102, 114, 101, 113, 117, 101, 110, 99, 121, 32, 119, 105, 116, 104, 32, 119, 104, 105, 99, 104, 32, 116, 104, 101, 32, 100, 101, 99, 105, 115, 105, 111, 110, 32, 104, 101, 117, 114, 105, 115, 116, 105, 99, 32, 116, 114, 105, 101, 115, 32, 116, 111, 32, 99, 104, 111, 111, 115, 101, 32, 97, 32, 114, 97, 110, 100, 111, 109, 32, 118, 97, 114, 105, 97, 98, 108, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 110, 100, 45, 115, 101, 101, 100, 0, 0, 0, 0, 0, 0, 0, 0, 85, 115, 101, 100, 32, 98, 121, 32, 116, 104, 101, 32, 114, 97, 110, 100, 111, 109, 32, 118, 97, 114, 105, 97, 98, 108, 101, 32, 115, 101, 108, 101, 99, 116, 105, 111, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99, 99, 109, 105, 110, 45, 109, 111, 100, 101, 0, 0, 0, 0, 0, 0, 67, 111, 110, 116, 114, 111, 108, 115, 32, 99, 111, 110, 102, 108, 105, 99, 116, 32, 99, 108, 97, 117, 115, 101, 32, 109, 105, 110, 105, 109, 105, 122, 97, 116, 105, 111, 110, 32, 40, 48, 61, 110, 111, 110, 101, 44, 32, 49, 61, 98, 97, 115, 105, 99, 44, 32, 50, 61, 100, 101, 101, 112, 41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 112, 104, 97, 115, 101, 45, 115, 97, 118, 105, 110, 103, 0, 0, 0, 0, 67, 111, 110, 116, 114, 111, 108, 115, 32, 116, 104, 101, 32, 108, 101, 118, 101, 108, 32, 111, 102, 32, 112, 104, 97, 115, 101, 32, 115, 97, 118, 105, 110, 103, 32, 40, 48, 61, 110, 111, 110, 101, 44, 32, 49, 61, 108, 105, 109, 105, 116, 101, 100, 44, 32, 50, 61, 102, 117, 108, 108, 41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 110, 100, 45, 105, 110, 105, 116, 0, 0, 0, 0, 0, 0, 0, 0, 82, 97, 110, 100, 111, 109, 105, 122, 101, 32, 116, 104, 101, 32, 105, 110, 105, 116, 105, 97, 108, 32, 97, 99, 116, 105, 118, 105, 116, 121, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 108, 117, 98, 121, 0, 0, 0, 0, 85, 115, 101, 32, 116, 104, 101, 32, 76, 117, 98, 121, 32, 114, 101, 115, 116, 97, 114, 116, 32, 115, 101, 113, 117, 101, 110, 99, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 102, 105, 114, 115, 116, 0, 0, 84, 104, 101, 32, 98, 97, 115, 101, 32, 114, 101, 115, 116, 97, 114, 116, 32, 105, 110, 116, 101, 114, 118, 97, 108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 105, 110, 99, 0, 0, 0, 0, 82, 101, 115, 116, 97, 114, 116, 32, 105, 110, 116, 101, 114, 118, 97, 108, 32, 105, 110, 99, 114, 101, 97, 115, 101, 32, 102, 97, 99, 116, 111, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 103, 99, 45, 102, 114, 97, 99, 0, 84, 104, 101, 32, 102, 114, 97, 99, 116, 105, 111, 110, 32, 111, 102, 32, 119, 97, 115, 116, 101, 100, 32, 109, 101, 109, 111, 114, 121, 32, 97, 108, 108, 111, 119, 101, 100, 32, 98, 101, 102, 111, 114, 101, 32, 97, 32, 103, 97, 114, 98, 97, 103, 101, 32, 99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 32, 105, 115, 32, 116, 114, 105, 103, 103, 101, 114, 101, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 109, 105, 110, 45, 108, 101, 97, 114, 110, 116, 115, 0, 0, 0, 0, 0, 77, 105, 110, 105, 109, 117, 109, 32, 108, 101, 97, 114, 110, 116, 32, 99, 108, 97, 117, 115, 101, 32, 108, 105, 109, 105, 116, 0, 0, 0, 0, 0, 0, 0, 0, 0, 192, 7, 0, 0, 5, 0, 0, 0, 6, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 124, 32, 37, 57, 100, 32, 124, 32, 37, 55, 100, 32, 37, 56, 100, 32, 37, 56, 100, 32, 124, 32, 37, 56, 100, 32, 37, 56, 100, 32, 37, 54, 46, 48, 102, 32, 124, 32, 37, 54, 46, 51, 102, 32, 37, 37, 32, 124, 10, 0, 0, 0, 0, 0, 0, 0, 124, 32, 32, 71, 97, 114, 98, 97, 103, 101, 32, 99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 58, 32, 32, 32, 37, 49, 50, 100, 32, 98, 121, 116, 101, 115, 32, 61, 62, 32, 37, 49, 50, 100, 32, 98, 121, 116, 101, 115, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 124, 10, 0, 0, 0, 0, 0, 0, 0, 0, 78, 55, 77, 105, 110, 105, 115, 97, 116, 54, 83, 111, 108, 118, 101, 114, 69, 0, 0, 0, 0, 0, 0, 0, 88, 18, 0, 0, 168, 7, 0, 0, 60, 98, 111, 111, 108, 62, 0, 0, 10, 32, 32, 32, 32, 32, 32, 32, 32, 37, 115, 10, 0, 0, 0, 0, 60, 105, 110, 116, 51, 50, 62, 0, 69, 82, 82, 79, 82, 33, 32, 118, 97, 108, 117, 101, 32, 60, 37, 115, 62, 32, 105, 115, 32, 116, 111, 111, 32, 108, 97, 114, 103, 101, 32, 102, 111, 114, 32, 111, 112, 116, 105, 111, 110, 32, 34, 37, 115, 34, 46, 10, 0, 0, 0, 0, 0, 0, 0, 0, 69, 82, 82, 79, 82, 33, 32, 118, 97, 108, 117, 101, 32, 60, 37, 115, 62, 32, 105, 115, 32, 116, 111, 111, 32, 115, 109, 97, 108, 108, 32, 102, 111, 114, 32, 111, 112, 116, 105, 111, 110, 32, 34, 37, 115, 34, 46, 10, 0, 0, 0, 0, 0, 0, 0, 0, 67, 79, 82, 69, 0, 0, 0, 0, 60, 100, 111, 117, 98, 108, 101, 62, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 168, 8, 0, 0, 1, 0, 0, 0, 8, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 78, 55, 77, 105, 110, 105, 115, 97, 116, 49, 50, 68, 111, 117, 98, 108, 101, 79, 112, 116, 105, 111, 110, 69, 0, 0, 0, 0, 0, 0, 0, 0, 128, 18, 0, 0, 136, 8, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 32, 32, 45, 37, 45, 49, 50, 115, 32, 61, 32, 37, 45, 56, 115, 32, 37, 99, 37, 52, 46, 50, 103, 32, 46, 46, 32, 37, 52, 46, 50, 103, 37, 99, 32, 40, 100, 101, 102, 97, 117, 108, 116, 58, 32, 37, 103, 41, 10, 0, 0, 0, 0, 0, 0, 0, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 91, 32, 83, 101, 97, 114, 99, 104, 32, 83, 116, 97, 116, 105, 115, 116, 105, 99, 115, 32, 93, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 0, 124, 32, 67, 111, 110, 102, 108, 105, 99, 116, 115, 32, 124, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 79, 82, 73, 71, 73, 78, 65, 76, 32, 32, 32, 32, 32, 32, 32, 32, 32, 124, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 76, 69, 65, 82, 78, 84, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 124, 32, 80, 114, 111, 103, 114, 101, 115, 115, 32, 124, 0, 124, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 124, 32, 32, 32, 32, 86, 97, 114, 115, 32, 32, 67, 108, 97, 117, 115, 101, 115, 32, 76, 105, 116, 101, 114, 97, 108, 115, 32, 124, 32, 32, 32, 32, 76, 105, 109, 105, 116, 32, 32, 67, 108, 97, 117, 115, 101, 115, 32, 76, 105, 116, 47, 67, 108, 32, 124, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 124, 0, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 97, 115, 121, 109, 109, 0, 0, 0, 83, 104, 114, 105, 110, 107, 32, 99, 108, 97, 117, 115, 101, 115, 32, 98, 121, 32, 97, 115, 121, 109, 109, 101, 116, 114, 105, 99, 32, 98, 114, 97, 110, 99, 104, 105, 110, 103, 46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 99, 104, 101, 99, 107, 0, 0, 67, 104, 101, 99, 107, 32, 105, 102, 32, 97, 32, 99, 108, 97, 117, 115, 101, 32, 105, 115, 32, 97, 108, 114, 101, 97, 100, 121, 32, 105, 109, 112, 108, 105, 101, 100, 46, 32, 40, 99, 111, 115, 116, 108, 121, 41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 101, 108, 105, 109, 0, 0, 0, 0, 80, 101, 114, 102, 111, 114, 109, 32, 118, 97, 114, 105, 97, 98, 108, 101, 32, 101, 108, 105, 109, 105, 110, 97, 116, 105, 111, 110, 46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 103, 114, 111, 119, 0, 0, 0, 0, 65, 108, 108, 111, 119, 32, 97, 32, 118, 97, 114, 105, 97, 98, 108, 101, 32, 101, 108, 105, 109, 105, 110, 97, 116, 105, 111, 110, 32, 115, 116, 101, 112, 32, 116, 111, 32, 103, 114, 111, 119, 32, 98, 121, 32, 97, 32, 110, 117, 109, 98, 101, 114, 32, 111, 102, 32, 99, 108, 97, 117, 115, 101, 115, 46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99, 108, 45, 108, 105, 109, 0, 0, 86, 97, 114, 105, 97, 98, 108, 101, 115, 32, 97, 114, 101, 32, 110, 111, 116, 32, 101, 108, 105, 109, 105, 110, 97, 116, 101, 100, 32, 105, 102, 32, 105, 116, 32, 112, 114, 111, 100, 117, 99, 101, 115, 32, 97, 32, 114, 101, 115, 111, 108, 118, 101, 110, 116, 32, 119, 105, 116, 104, 32, 97, 32, 108, 101, 110, 103, 116, 104, 32, 97, 98, 111, 118, 101, 32, 116, 104, 105, 115, 32, 108, 105, 109, 105, 116, 46, 32, 45, 49, 32, 109, 101, 97, 110, 115, 32, 110, 111, 32, 108, 105, 109, 105, 116, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 115, 117, 98, 45, 108, 105, 109, 0, 68, 111, 32, 110, 111, 116, 32, 99, 104, 101, 99, 107, 32, 105, 102, 32, 115, 117, 98, 115, 117, 109, 112, 116, 105, 111, 110, 32, 97, 103, 97, 105, 110, 115, 116, 32, 97, 32, 99, 108, 97, 117, 115, 101, 32, 108, 97, 114, 103, 101, 114, 32, 116, 104, 97, 110, 32, 116, 104, 105, 115, 46, 32, 45, 49, 32, 109, 101, 97, 110, 115, 32, 110, 111, 32, 108, 105, 109, 105, 116, 46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 115, 105, 109, 112, 45, 103, 99, 45, 102, 114, 97, 99, 0, 0, 0, 0, 84, 104, 101, 32, 102, 114, 97, 99, 116, 105, 111, 110, 32, 111, 102, 32, 119, 97, 115, 116, 101, 100, 32, 109, 101, 109, 111, 114, 121, 32, 97, 108, 108, 111, 119, 101, 100, 32, 98, 101, 102, 111, 114, 101, 32, 97, 32, 103, 97, 114, 98, 97, 103, 101, 32, 99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 32, 105, 115, 32, 116, 114, 105, 103, 103, 101, 114, 101, 100, 32, 100, 117, 114, 105, 110, 103, 32, 115, 105, 109, 112, 108, 105, 102, 105, 99, 97, 116, 105, 111, 110, 46, 0, 0, 0, 0, 0, 0, 0, 120, 14, 0, 0, 9, 0, 0, 0, 10, 0, 0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 115, 117, 98, 115, 117, 109, 112, 116, 105, 111, 110, 32, 108, 101, 102, 116, 58, 32, 37, 49, 48, 100, 32, 40, 37, 49, 48, 100, 32, 115, 117, 98, 115, 117, 109, 101, 100, 44, 32, 37, 49, 48, 100, 32, 100, 101, 108, 101, 116, 101, 100, 32, 108, 105, 116, 101, 114, 97, 108, 115, 41, 13, 0, 0, 101, 108, 105, 109, 105, 110, 97, 116, 105, 111, 110, 32, 108, 101, 102, 116, 58, 32, 37, 49, 48, 100, 13, 0, 124, 32, 32, 69, 108, 105, 109, 105, 110, 97, 116, 101, 100, 32, 99, 108, 97, 117, 115, 101, 115, 58, 32, 32, 32, 32, 32, 37, 49, 48, 46, 50, 102, 32, 77, 98, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 124, 10, 0, 0, 0, 0, 124, 32, 32, 71, 97, 114, 98, 97, 103, 101, 32, 99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 58, 32, 32, 32, 37, 49, 50, 100, 32, 98, 121, 116, 101, 115, 32, 61, 62, 32, 37, 49, 50, 100, 32, 98, 121, 116, 101, 115, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 124, 10, 0, 0, 0, 0, 0, 0, 0, 0, 78, 55, 77, 105, 110, 105, 115, 97, 116, 49, 48, 83, 105, 109, 112, 83, 111, 108, 118, 101, 114, 69, 0, 0, 128, 18, 0, 0, 96, 14, 0, 0, 192, 7, 0, 0, 0, 0, 0, 0, 60, 100, 111, 117, 98, 108, 101, 62, 0, 0, 0, 0, 0, 0, 0, 0, 60, 105, 110, 116, 51, 50, 62, 0, 83, 73, 77, 80, 0, 0, 0, 0, 60, 98, 111, 111, 108, 62, 0, 0, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 61, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 89, 79, 33, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 48, 15, 0, 0, 0, 0, 0, 0, 117, 110, 99, 97, 117, 103, 104, 116, 0, 0, 0, 0, 0, 0, 0, 0, 116, 101, 114, 109, 105, 110, 97, 116, 105, 110, 103, 32, 119, 105, 116, 104, 32, 37, 115, 32, 101, 120, 99, 101, 112, 116, 105, 111, 110, 32, 111, 102, 32, 116, 121, 112, 101, 32, 37, 115, 58, 32, 37, 115, 0, 0, 0, 0, 116, 101, 114, 109, 105, 110, 97, 116, 105, 110, 103, 32, 119, 105, 116, 104, 32, 37, 115, 32, 101, 120, 99, 101, 112, 116, 105, 111, 110, 32, 111, 102, 32, 116, 121, 112, 101, 32, 37, 115, 0, 0, 0, 0, 0, 0, 0, 0, 116, 101, 114, 109, 105, 110, 97, 116, 105, 110, 103, 32, 119, 105, 116, 104, 32, 37, 115, 32, 102, 111, 114, 101, 105, 103, 110, 32, 101, 120, 99, 101, 112, 116, 105, 111, 110, 0, 0, 0, 116, 101, 114, 109, 105, 110, 97, 116, 105, 110, 103, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 112, 116, 104, 114, 101, 97, 100, 95, 111, 110, 99, 101, 32, 102, 97, 105, 108, 117, 114, 101, 32, 105, 110, 32, 95, 95, 99, 120, 97, 95, 103, 101, 116, 95, 103, 108, 111, 98, 97, 108, 115, 95, 102, 97, 115, 116, 40, 41, 0, 0, 0, 0, 0, 0, 0, 0, 99, 97, 110, 110, 111, 116, 32, 99, 114, 101, 97, 116, 101, 32, 112, 116, 104, 114, 101, 97, 100, 32, 107, 101, 121, 32, 102, 111, 114, 32, 95, 95, 99, 120, 97, 95, 103, 101, 116, 95, 103, 108, 111, 98, 97, 108, 115, 40, 41, 0, 0, 0, 0, 0, 0, 0, 99, 97, 110, 110, 111, 116, 32, 122, 101, 114, 111, 32, 111, 117, 116, 32, 116, 104, 114, 101, 97, 100, 32, 118, 97, 108, 117, 101, 32, 102, 111, 114, 32, 95, 95, 99, 120, 97, 95, 103, 101, 116, 95, 103, 108, 111, 98, 97, 108, 115, 40, 41, 0, 0, 0, 0, 0, 0, 0, 0, 200, 16, 0, 0, 12, 0, 0, 0, 13, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 115, 116, 100, 58, 58, 98, 97, 100, 95, 97, 108, 108, 111, 99, 0, 0, 83, 116, 57, 98, 97, 100, 95, 97, 108, 108, 111, 99, 0, 0, 0, 0, 128, 18, 0, 0, 184, 16, 0, 0, 80, 17, 0, 0, 0, 0, 0, 0, 116, 101, 114, 109, 105, 110, 97, 116, 101, 95, 104, 97, 110, 100, 108, 101, 114, 32, 117, 110, 101, 120, 112, 101, 99, 116, 101, 100, 108, 121, 32, 114, 101, 116, 117, 114, 110, 101, 100, 0, 116, 101, 114, 109, 105, 110, 97, 116, 101, 95, 104, 97, 110, 100, 108, 101, 114, 32, 117, 110, 101, 120, 112, 101, 99, 116, 101, 100, 108, 121, 32, 116, 104, 114, 101, 119, 32, 97, 110, 32, 101, 120, 99, 101, 112, 116, 105, 111, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 83, 116, 57, 101, 120, 99, 101, 112, 116, 105, 111, 110, 0, 0, 0, 0, 88, 18, 0, 0, 64, 17, 0, 0, 83, 116, 57, 116, 121, 112, 101, 95, 105, 110, 102, 111, 0, 0, 0, 0, 88, 18, 0, 0, 88, 17, 0, 0, 78, 49, 48, 95, 95, 99, 120, 120, 97, 98, 105, 118, 49, 49, 54, 95, 95, 115, 104, 105, 109, 95, 116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 0, 0, 0, 0, 0, 0, 0, 128, 18, 0, 0, 112, 17, 0, 0, 104, 17, 0, 0, 0, 0, 0, 0, 78, 49, 48, 95, 95, 99, 120, 120, 97, 98, 105, 118, 49, 49, 55, 95, 95, 99, 108, 97, 115, 115, 95, 116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 0, 0, 0, 0, 0, 0, 128, 18, 0, 0, 168, 17, 0, 0, 152, 17, 0, 0, 0, 0, 0, 0, 78, 49, 48, 95, 95, 99, 120, 120, 97, 98, 105, 118, 49, 49, 57, 95, 95, 112, 111, 105, 110, 116, 101, 114, 95, 116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 0, 0, 0, 0, 78, 49, 48, 95, 95, 99, 120, 120, 97, 98, 105, 118, 49, 49, 55, 95, 95, 112, 98, 97, 115, 101, 95, 116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 0, 0, 0, 0, 0, 0, 128, 18, 0, 0, 8, 18, 0, 0, 152, 17, 0, 0, 0, 0, 0, 0, 128, 18, 0, 0, 224, 17, 0, 0, 48, 18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 208, 17, 0, 0, 14, 0, 0, 0, 15, 0, 0, 0, 16, 0, 0, 0, 17, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 200, 18, 0, 0, 14, 0, 0, 0, 18, 0, 0, 0, 16, 0, 0, 0, 17, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 78, 49, 48, 95, 95, 99, 120, 120, 97, 98, 105, 118, 49, 50, 48, 95, 95, 115, 105, 95, 99, 108, 97, 115, 115, 95, 116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 0, 0, 0, 128, 18, 0, 0, 160, 18, 0, 0, 208, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 255, 255, 255, 255, 255, 255, 255, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 255, 255, 255, 255, 255, 255, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4, 7, 3, 6, 5, 0, 0, 0, 0, 0, 0, 0, 0, 105, 110, 102, 105, 110, 105, 116, 121, 0, 0, 0, 0, 0, 0, 0, 0, 110, 97, 110, 0, 0, 0, 0, 0, 95, 112, 137, 0, 255, 9, 47, 15, 10, 0, 0, 0, 100, 0, 0, 0, 232, 3, 0, 0, 16, 39, 0, 0, 160, 134, 1, 0, 64, 66, 15, 0, 128, 150, 152, 0, 0, 225, 245, 5], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
                    var tempDoublePtr = Runtime.alignMemory(allocate(12, "i8", ALLOC_STATIC), 8);
                    assert(tempDoublePtr % 8 == 0);

                    function copyTempFloat(ptr) {
                        HEAP8[tempDoublePtr] = HEAP8[ptr];
                        HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
                        HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
                        HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3]
                    }

                    function copyTempDouble(ptr) {
                        HEAP8[tempDoublePtr] = HEAP8[ptr];
                        HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
                        HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
                        HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
                        HEAP8[tempDoublePtr + 4] = HEAP8[ptr + 4];
                        HEAP8[tempDoublePtr + 5] = HEAP8[ptr + 5];
                        HEAP8[tempDoublePtr + 6] = HEAP8[ptr + 6];
                        HEAP8[tempDoublePtr + 7] = HEAP8[ptr + 7]
                    }

                    function _atexit(func, arg) { __ATEXIT__.unshift({ func: func, arg: arg }) }

                    function ___cxa_atexit() { return _atexit.apply(null, arguments) }
                    Module["_i64Subtract"] = _i64Subtract;
                    var ___errno_state = 0;

                    function ___setErrNo(value) { HEAP32[___errno_state >> 2] = value; return value }
                    var ERRNO_CODES = { EPERM: 1, ENOENT: 2, ESRCH: 3, EINTR: 4, EIO: 5, ENXIO: 6, E2BIG: 7, ENOEXEC: 8, EBADF: 9, ECHILD: 10, EAGAIN: 11, EWOULDBLOCK: 11, ENOMEM: 12, EACCES: 13, EFAULT: 14, ENOTBLK: 15, EBUSY: 16, EEXIST: 17, EXDEV: 18, ENODEV: 19, ENOTDIR: 20, EISDIR: 21, EINVAL: 22, ENFILE: 23, EMFILE: 24, ENOTTY: 25, ETXTBSY: 26, EFBIG: 27, ENOSPC: 28, ESPIPE: 29, EROFS: 30, EMLINK: 31, EPIPE: 32, EDOM: 33, ERANGE: 34, ENOMSG: 42, EIDRM: 43, ECHRNG: 44, EL2NSYNC: 45, EL3HLT: 46, EL3RST: 47, ELNRNG: 48, EUNATCH: 49, ENOCSI: 50, EL2HLT: 51, EDEADLK: 35, ENOLCK: 37, EBADE: 52, EBADR: 53, EXFULL: 54, ENOANO: 55, EBADRQC: 56, EBADSLT: 57, EDEADLOCK: 35, EBFONT: 59, ENOSTR: 60, ENODATA: 61, ETIME: 62, ENOSR: 63, ENONET: 64, ENOPKG: 65, EREMOTE: 66, ENOLINK: 67, EADV: 68, ESRMNT: 69, ECOMM: 70, EPROTO: 71, EMULTIHOP: 72, EDOTDOT: 73, EBADMSG: 74, ENOTUNIQ: 76, EBADFD: 77, EREMCHG: 78, ELIBACC: 79, ELIBBAD: 80, ELIBSCN: 81, ELIBMAX: 82, ELIBEXEC: 83, ENOSYS: 38, ENOTEMPTY: 39, ENAMETOOLONG: 36, ELOOP: 40, EOPNOTSUPP: 95, EPFNOSUPPORT: 96, ECONNRESET: 104, ENOBUFS: 105, EAFNOSUPPORT: 97, EPROTOTYPE: 91, ENOTSOCK: 88, ENOPROTOOPT: 92, ESHUTDOWN: 108, ECONNREFUSED: 111, EADDRINUSE: 98, ECONNABORTED: 103, ENETUNREACH: 101, ENETDOWN: 100, ETIMEDOUT: 110, EHOSTDOWN: 112, EHOSTUNREACH: 113, EINPROGRESS: 115, EALREADY: 114, EDESTADDRREQ: 89, EMSGSIZE: 90, EPROTONOSUPPORT: 93, ESOCKTNOSUPPORT: 94, EADDRNOTAVAIL: 99, ENETRESET: 102, EISCONN: 106, ENOTCONN: 107, ETOOMANYREFS: 109, EUSERS: 87, EDQUOT: 122, ESTALE: 116, ENOTSUP: 95, ENOMEDIUM: 123, EILSEQ: 84, EOVERFLOW: 75, ECANCELED: 125, ENOTRECOVERABLE: 131, EOWNERDEAD: 130, ESTRPIPE: 86 };

                    function _sysconf(name) {
                        switch (name) {
                            case 30:
                                return PAGE_SIZE;
                            case 132:
                            case 133:
                            case 12:
                            case 137:
                            case 138:
                            case 15:
                            case 235:
                            case 16:
                            case 17:
                            case 18:
                            case 19:
                            case 20:
                            case 149:
                            case 13:
                            case 10:
                            case 236:
                            case 153:
                            case 9:
                            case 21:
                            case 22:
                            case 159:
                            case 154:
                            case 14:
                            case 77:
                            case 78:
                            case 139:
                            case 80:
                            case 81:
                            case 79:
                            case 82:
                            case 68:
                            case 67:
                            case 164:
                            case 11:
                            case 29:
                            case 47:
                            case 48:
                            case 95:
                            case 52:
                            case 51:
                            case 46:
                                return 200809;
                            case 27:
                            case 246:
                            case 127:
                            case 128:
                            case 23:
                            case 24:
                            case 160:
                            case 161:
                            case 181:
                            case 182:
                            case 242:
                            case 183:
                            case 184:
                            case 243:
                            case 244:
                            case 245:
                            case 165:
                            case 178:
                            case 179:
                            case 49:
                            case 50:
                            case 168:
                            case 169:
                            case 175:
                            case 170:
                            case 171:
                            case 172:
                            case 97:
                            case 76:
                            case 32:
                            case 173:
                            case 35:
                                return -1;
                            case 176:
                            case 177:
                            case 7:
                            case 155:
                            case 8:
                            case 157:
                            case 125:
                            case 126:
                            case 92:
                            case 93:
                            case 129:
                            case 130:
                            case 131:
                            case 94:
                            case 91:
                                return 1;
                            case 74:
                            case 60:
                            case 69:
                            case 70:
                            case 4:
                                return 1024;
                            case 31:
                            case 42:
                            case 72:
                                return 32;
                            case 87:
                            case 26:
                            case 33:
                                return 2147483647;
                            case 34:
                            case 1:
                                return 47839;
                            case 38:
                            case 36:
                                return 99;
                            case 43:
                            case 37:
                                return 2048;
                            case 0:
                                return 2097152;
                            case 3:
                                return 65536;
                            case 28:
                                return 32768;
                            case 44:
                                return 32767;
                            case 75:
                                return 16384;
                            case 39:
                                return 1e3;
                            case 89:
                                return 700;
                            case 71:
                                return 256;
                            case 40:
                                return 255;
                            case 2:
                                return 100;
                            case 180:
                                return 64;
                            case 25:
                                return 20;
                            case 5:
                                return 16;
                            case 6:
                                return 6;
                            case 73:
                                return 4;
                            case 84:
                                { if (typeof navigator === "object") return navigator["hardwareConcurrency"] || 1; return 1 }
                        }
                        ___setErrNo(ERRNO_CODES.EINVAL);
                        return -1
                    }

                    function __ZSt18uncaught_exceptionv() { return !!__ZSt18uncaught_exceptionv.uncaught_exception }
                    var EXCEPTIONS = {
                        last: 0,
                        caught: [],
                        infos: {},
                        deAdjust: function(adjusted) { if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted; for (var ptr in EXCEPTIONS.infos) { var info = EXCEPTIONS.infos[ptr]; if (info.adjusted === adjusted) { return ptr } } return adjusted },
                        addRef: function(ptr) {
                            if (!ptr) return;
                            var info = EXCEPTIONS.infos[ptr];
                            info.refcount++
                        },
                        decRef: function(ptr) {
                            if (!ptr) return;
                            var info = EXCEPTIONS.infos[ptr];
                            assert(info.refcount > 0);
                            info.refcount--;
                            if (info.refcount === 0) {
                                if (info.destructor) { Runtime.dynCall("vi", info.destructor, [ptr]) }
                                delete EXCEPTIONS.infos[ptr];
                                ___cxa_free_exception(ptr)
                            }
                        },
                        clearRef: function(ptr) {
                            if (!ptr) return;
                            var info = EXCEPTIONS.infos[ptr];
                            info.refcount = 0
                        }
                    };

                    function ___resumeException(ptr) {
                        if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr }
                        EXCEPTIONS.clearRef(EXCEPTIONS.deAdjust(ptr));
                        throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch."
                    }

                    function ___cxa_find_matching_catch() {
                        var thrown = EXCEPTIONS.last;
                        if (!thrown) { return (asm["setTempRet0"](0), 0) | 0 }
                        var info = EXCEPTIONS.infos[thrown];
                        var throwntype = info.type;
                        if (!throwntype) { return (asm["setTempRet0"](0), thrown) | 0 }
                        var typeArray = Array.prototype.slice.call(arguments);
                        var pointer = Module["___cxa_is_pointer_type"](throwntype);
                        if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
                        HEAP32[___cxa_find_matching_catch.buffer >> 2] = thrown;
                        thrown = ___cxa_find_matching_catch.buffer;
                        for (var i = 0; i < typeArray.length; i++) {
                            if (typeArray[i] && Module["___cxa_can_catch"](typeArray[i], throwntype, thrown)) {
                                thrown = HEAP32[thrown >> 2];
                                info.adjusted = thrown;
                                return (asm["setTempRet0"](typeArray[i]), thrown) | 0
                            }
                        }
                        thrown = HEAP32[thrown >> 2];
                        return (asm["setTempRet0"](throwntype), thrown) | 0
                    }

                    function ___cxa_throw(ptr, type, destructor) {
                        EXCEPTIONS.infos[ptr] = { ptr: ptr, adjusted: ptr, type: type, destructor: destructor, refcount: 0 };
                        EXCEPTIONS.last = ptr;
                        if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) { __ZSt18uncaught_exceptionv.uncaught_exception = 1 } else { __ZSt18uncaught_exceptionv.uncaught_exception++ }
                        throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch."
                    }
                    Module["_memset"] = _memset;
                    Module["_bitshift64Shl"] = _bitshift64Shl;

                    function _abort() { Module["abort"]() }
                    var FS = undefined;
                    var SOCKFS = undefined;

                    function _send(fd, buf, len, flags) { var sock = SOCKFS.getSocket(fd); if (!sock) { ___setErrNo(ERRNO_CODES.EBADF); return -1 } return _write(fd, buf, len) }

                    function _pwrite(fildes, buf, nbyte, offset) { var stream = FS.getStream(fildes); if (!stream) { ___setErrNo(ERRNO_CODES.EBADF); return -1 } try { var slab = HEAP8; return FS.write(stream, slab, buf, nbyte, offset) } catch (e) { FS.handleFSError(e); return -1 } }

                    function _write(fildes, buf, nbyte) { var stream = FS.getStream(fildes); if (!stream) { ___setErrNo(ERRNO_CODES.EBADF); return -1 } try { var slab = HEAP8; return FS.write(stream, slab, buf, nbyte) } catch (e) { FS.handleFSError(e); return -1 } }

                    function _fileno(stream) { stream = FS.getStreamFromPtr(stream); if (!stream) return -1; return stream.fd }

                    function _fwrite(ptr, size, nitems, stream) { var bytesToWrite = nitems * size; if (bytesToWrite == 0) return 0; var fd = _fileno(stream); var bytesWritten = _write(fd, ptr, bytesToWrite); if (bytesWritten == -1) { var streamObj = FS.getStreamFromPtr(stream); if (streamObj) streamObj.error = true; return 0 } else { return bytesWritten / size | 0 } }
                    Module["_strlen"] = _strlen;

                    function __reallyNegative(x) { return x < 0 || x === 0 && 1 / x === -Infinity }

                    function __formatString(format, varargs) {
                        var textIndex = format;
                        var argIndex = 0;

                        function getNextArg(type) {
                            var ret;
                            if (type === "double") { ret = (HEAP32[tempDoublePtr >> 2] = HEAP32[varargs + argIndex >> 2], HEAP32[tempDoublePtr + 4 >> 2] = HEAP32[varargs + (argIndex + 4) >> 2], +HEAPF64[tempDoublePtr >> 3]) } else if (type == "i64") { ret = [HEAP32[varargs + argIndex >> 2], HEAP32[varargs + (argIndex + 4) >> 2]] } else {
                                type = "i32";
                                ret = HEAP32[varargs + argIndex >> 2]
                            }
                            argIndex += Runtime.getNativeFieldSize(type);
                            return ret
                        }
                        var ret = [];
                        var curr, next, currArg;
                        while (1) {
                            var startTextIndex = textIndex;
                            curr = HEAP8[textIndex >> 0];
                            if (curr === 0) break;
                            next = HEAP8[textIndex + 1 >> 0];
                            if (curr == 37) {
                                var flagAlwaysSigned = false;
                                var flagLeftAlign = false;
                                var flagAlternative = false;
                                var flagZeroPad = false;
                                var flagPadSign = false;
                                flagsLoop: while (1) {
                                    switch (next) {
                                        case 43:
                                            flagAlwaysSigned = true;
                                            break;
                                        case 45:
                                            flagLeftAlign = true;
                                            break;
                                        case 35:
                                            flagAlternative = true;
                                            break;
                                        case 48:
                                            if (flagZeroPad) { break flagsLoop } else { flagZeroPad = true; break };
                                        case 32:
                                            flagPadSign = true;
                                            break;
                                        default:
                                            break flagsLoop
                                    }
                                    textIndex++;
                                    next = HEAP8[textIndex + 1 >> 0]
                                }
                                var width = 0;
                                if (next == 42) {
                                    width = getNextArg("i32");
                                    textIndex++;
                                    next = HEAP8[textIndex + 1 >> 0]
                                } else {
                                    while (next >= 48 && next <= 57) {
                                        width = width * 10 + (next - 48);
                                        textIndex++;
                                        next = HEAP8[textIndex + 1 >> 0]
                                    }
                                }
                                var precisionSet = false,
                                    precision = -1;
                                if (next == 46) {
                                    precision = 0;
                                    precisionSet = true;
                                    textIndex++;
                                    next = HEAP8[textIndex + 1 >> 0];
                                    if (next == 42) {
                                        precision = getNextArg("i32");
                                        textIndex++
                                    } else {
                                        while (1) {
                                            var precisionChr = HEAP8[textIndex + 1 >> 0];
                                            if (precisionChr < 48 || precisionChr > 57) break;
                                            precision = precision * 10 + (precisionChr - 48);
                                            textIndex++
                                        }
                                    }
                                    next = HEAP8[textIndex + 1 >> 0]
                                }
                                if (precision < 0) {
                                    precision = 6;
                                    precisionSet = false
                                }
                                var argSize;
                                switch (String.fromCharCode(next)) {
                                    case "h":
                                        var nextNext = HEAP8[textIndex + 2 >> 0];
                                        if (nextNext == 104) {
                                            textIndex++;
                                            argSize = 1
                                        } else { argSize = 2 }
                                        break;
                                    case "l":
                                        var nextNext = HEAP8[textIndex + 2 >> 0];
                                        if (nextNext == 108) {
                                            textIndex++;
                                            argSize = 8
                                        } else { argSize = 4 }
                                        break;
                                    case "L":
                                    case "q":
                                    case "j":
                                        argSize = 8;
                                        break;
                                    case "z":
                                    case "t":
                                    case "I":
                                        argSize = 4;
                                        break;
                                    default:
                                        argSize = null
                                }
                                if (argSize) textIndex++;
                                next = HEAP8[textIndex + 1 >> 0];
                                switch (String.fromCharCode(next)) {
                                    case "d":
                                    case "i":
                                    case "u":
                                    case "o":
                                    case "x":
                                    case "X":
                                    case "p":
                                        {
                                            var signed = next == 100 || next == 105;argSize = argSize || 4;
                                            var currArg = getNextArg("i" + argSize * 8);
                                            var origArg = currArg;
                                            var argText;
                                            if (argSize == 8) { currArg = Runtime.makeBigInt(currArg[0], currArg[1], next == 117) }
                                            if (argSize <= 4) {
                                                var limit = Math.pow(256, argSize) - 1;
                                                currArg = (signed ? reSign : unSign)(currArg & limit, argSize * 8)
                                            }
                                            var currAbsArg = Math.abs(currArg);
                                            var prefix = "";
                                            if (next == 100 || next == 105) {
                                                if (argSize == 8 && i64Math) argText = i64Math.stringify(origArg[0], origArg[1], null);
                                                else argText = reSign(currArg, 8 * argSize, 1).toString(10)
                                            } else if (next == 117) {
                                                if (argSize == 8 && i64Math) argText = i64Math.stringify(origArg[0], origArg[1], true);
                                                else argText = unSign(currArg, 8 * argSize, 1).toString(10);
                                                currArg = Math.abs(currArg)
                                            } else if (next == 111) { argText = (flagAlternative ? "0" : "") + currAbsArg.toString(8) } else if (next == 120 || next == 88) {
                                                prefix = flagAlternative && currArg != 0 ? "0x" : "";
                                                if (argSize == 8 && i64Math) {
                                                    if (origArg[1]) {
                                                        argText = (origArg[1] >>> 0).toString(16);
                                                        var lower = (origArg[0] >>> 0).toString(16);
                                                        while (lower.length < 8) lower = "0" + lower;
                                                        argText += lower
                                                    } else { argText = (origArg[0] >>> 0).toString(16) }
                                                } else if (currArg < 0) {
                                                    currArg = -currArg;
                                                    argText = (currAbsArg - 1).toString(16);
                                                    var buffer = [];
                                                    for (var i = 0; i < argText.length; i++) { buffer.push((15 - parseInt(argText[i], 16)).toString(16)) }
                                                    argText = buffer.join("");
                                                    while (argText.length < argSize * 2) argText = "f" + argText
                                                } else { argText = currAbsArg.toString(16) }
                                                if (next == 88) {
                                                    prefix = prefix.toUpperCase();
                                                    argText = argText.toUpperCase()
                                                }
                                            } else if (next == 112) {
                                                if (currAbsArg === 0) { argText = "(nil)" } else {
                                                    prefix = "0x";
                                                    argText = currAbsArg.toString(16)
                                                }
                                            }
                                            if (precisionSet) { while (argText.length < precision) { argText = "0" + argText } }
                                            if (currArg >= 0) { if (flagAlwaysSigned) { prefix = "+" + prefix } else if (flagPadSign) { prefix = " " + prefix } }
                                            if (argText.charAt(0) == "-") {
                                                prefix = "-" + prefix;
                                                argText = argText.substr(1)
                                            }
                                            while (prefix.length + argText.length < width) { if (flagLeftAlign) { argText += " " } else { if (flagZeroPad) { argText = "0" + argText } else { prefix = " " + prefix } } }
                                            argText = prefix + argText;argText.split("").forEach(function(chr) { ret.push(chr.charCodeAt(0)) });
                                            break
                                        };
                                    case "f":
                                    case "F":
                                    case "e":
                                    case "E":
                                    case "g":
                                    case "G":
                                        {
                                            var currArg = getNextArg("double");
                                            var argText;
                                            if (isNaN(currArg)) {
                                                argText = "nan";
                                                flagZeroPad = false
                                            } else if (!isFinite(currArg)) {
                                                argText = (currArg < 0 ? "-" : "") + "inf";
                                                flagZeroPad = false
                                            } else {
                                                var isGeneral = false;
                                                var effectivePrecision = Math.min(precision, 20);
                                                if (next == 103 || next == 71) {
                                                    isGeneral = true;
                                                    precision = precision || 1;
                                                    var exponent = parseInt(currArg.toExponential(effectivePrecision).split("e")[1], 10);
                                                    if (precision > exponent && exponent >= -4) {
                                                        next = (next == 103 ? "f" : "F").charCodeAt(0);
                                                        precision -= exponent + 1
                                                    } else {
                                                        next = (next == 103 ? "e" : "E").charCodeAt(0);
                                                        precision--
                                                    }
                                                    effectivePrecision = Math.min(precision, 20)
                                                }
                                                if (next == 101 || next == 69) { argText = currArg.toExponential(effectivePrecision); if (/[eE][-+]\d$/.test(argText)) { argText = argText.slice(0, -1) + "0" + argText.slice(-1) } } else if (next == 102 || next == 70) { argText = currArg.toFixed(effectivePrecision); if (currArg === 0 && __reallyNegative(currArg)) { argText = "-" + argText } }
                                                var parts = argText.split("e");
                                                if (isGeneral && !flagAlternative) { while (parts[0].length > 1 && parts[0].indexOf(".") != -1 && (parts[0].slice(-1) == "0" || parts[0].slice(-1) == ".")) { parts[0] = parts[0].slice(0, -1) } } else { if (flagAlternative && argText.indexOf(".") == -1) parts[0] += "."; while (precision > effectivePrecision++) parts[0] += "0" }
                                                argText = parts[0] + (parts.length > 1 ? "e" + parts[1] : "");
                                                if (next == 69) argText = argText.toUpperCase();
                                                if (currArg >= 0) { if (flagAlwaysSigned) { argText = "+" + argText } else if (flagPadSign) { argText = " " + argText } }
                                            }
                                            while (argText.length < width) { if (flagLeftAlign) { argText += " " } else { if (flagZeroPad && (argText[0] == "-" || argText[0] == "+")) { argText = argText[0] + "0" + argText.slice(1) } else { argText = (flagZeroPad ? "0" : " ") + argText } } }
                                            if (next < 97) argText = argText.toUpperCase();argText.split("").forEach(function(chr) { ret.push(chr.charCodeAt(0)) });
                                            break
                                        };
                                    case "s":
                                        { var arg = getNextArg("i8*"); var argLength = arg ? _strlen(arg) : "(null)".length; if (precisionSet) argLength = Math.min(argLength, precision); if (!flagLeftAlign) { while (argLength < width--) { ret.push(32) } } if (arg) { for (var i = 0; i < argLength; i++) { ret.push(HEAPU8[arg++ >> 0]) } } else { ret = ret.concat(intArrayFromString("(null)".substr(0, argLength), true)) } if (flagLeftAlign) { while (argLength < width--) { ret.push(32) } } break };
                                    case "c":
                                        { if (flagLeftAlign) ret.push(getNextArg("i8")); while (--width > 0) { ret.push(32) } if (!flagLeftAlign) ret.push(getNextArg("i8")); break };
                                    case "n":
                                        { var ptr = getNextArg("i32*");HEAP32[ptr >> 2] = ret.length; break };
                                    case "%":
                                        { ret.push(curr); break };
                                    default:
                                        { for (var i = startTextIndex; i < textIndex + 2; i++) { ret.push(HEAP8[i >> 0]) } }
                                }
                                textIndex += 2
                            } else {
                                ret.push(curr);
                                textIndex += 1
                            }
                        }
                        return ret
                    }

                    function _fprintf(stream, format, varargs) {
                        var result = __formatString(format, varargs);
                        var stack = Runtime.stackSave();
                        var ret = _fwrite(allocate(result, "i8", ALLOC_STACK), 1, result.length, stream);
                        Runtime.stackRestore(stack);
                        return ret
                    }

                    function _printf(format, varargs) {
                        var result = __formatString(format, varargs);
                        var string = intArrayToString(result);
                        if (string[string.length - 1] === "\n") string = string.substr(0, string.length - 1);
                        Module.print(string);
                        return result.length
                    }

                    function _pthread_once(ptr, func) {
                        if (!_pthread_once.seen) _pthread_once.seen = {};
                        if (ptr in _pthread_once.seen) return;
                        Runtime.dynCall("v", func);
                        _pthread_once.seen[ptr] = 1
                    }

                    function _fputc(c, stream) {
                        var chr = unSign(c & 255);
                        HEAP8[_fputc.ret >> 0] = chr;
                        var fd = _fileno(stream);
                        var ret = _write(fd, _fputc.ret, 1);
                        if (ret == -1) { var streamObj = FS.getStreamFromPtr(stream); if (streamObj) streamObj.error = true; return -1 } else { return chr }
                    }
                    var PTHREAD_SPECIFIC = {};

                    function _pthread_getspecific(key) { return PTHREAD_SPECIFIC[key] || 0 }
                    Module["_i64Add"] = _i64Add;

                    function _fputs(s, stream) { var fd = _fileno(stream); return _write(fd, s, _strlen(s)) }
                    var _stdout = allocate(1, "i32*", ALLOC_STATIC);

                    function _puts(s) {
                        var result = Pointer_stringify(s);
                        var string = result.substr(0);
                        if (string[string.length - 1] === "\n") string = string.substr(0, string.length - 1);
                        Module.print(string);
                        return result.length
                    }

                    function _pthread_setspecific(key, value) {
                        if (!(key in PTHREAD_SPECIFIC)) { return ERRNO_CODES.EINVAL }
                        PTHREAD_SPECIFIC[key] = value;
                        return 0
                    }

                    function __exit(status) { Module["exit"](status) }

                    function _exit(status) { __exit(status) }
                    var _UItoD = true;

                    function _malloc(bytes) { var ptr = Runtime.dynamicAlloc(bytes + 8); return ptr + 8 & 4294967288 }
                    Module["_malloc"] = _malloc;

                    function ___cxa_allocate_exception(size) { return _malloc(size) }

                    function _fmod(x, y) { return x % y }

                    function _fmodl() { return _fmod.apply(null, arguments) }
                    Module["_bitshift64Lshr"] = _bitshift64Lshr;

                    function ___cxa_pure_virtual() { ABORT = true; throw "Pure virtual function called!" }

                    function _time(ptr) { var ret = Date.now() / 1e3 | 0; if (ptr) { HEAP32[ptr >> 2] = ret } return ret }
                    var PTHREAD_SPECIFIC_NEXT_KEY = 1;

                    function _pthread_key_create(key, destructor) {
                        if (key == 0) { return ERRNO_CODES.EINVAL }
                        HEAP32[key >> 2] = PTHREAD_SPECIFIC_NEXT_KEY;
                        PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
                        PTHREAD_SPECIFIC_NEXT_KEY++;
                        return 0
                    }

                    function ___cxa_guard_acquire(variable) { if (!HEAP8[variable >> 0]) { HEAP8[variable >> 0] = 1; return 1 } return 0 }

                    function ___cxa_guard_release() {}

                    function _vfprintf(s, f, va_arg) { return _fprintf(s, f, HEAP32[va_arg >> 2]) }

                    function ___cxa_begin_catch(ptr) {
                        __ZSt18uncaught_exceptionv.uncaught_exception--;
                        EXCEPTIONS.caught.push(ptr);
                        EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
                        return ptr
                    }

                    function _emscripten_memcpy_big(dest, src, num) { HEAPU8.set(HEAPU8.subarray(src, src + num), dest); return dest }
                    Module["_memcpy"] = _memcpy;
                    var _llvm_pow_f64 = Math_pow;

                    function _sbrk(bytes) {
                        var self = _sbrk;
                        if (!self.called) {
                            DYNAMICTOP = alignMemoryPage(DYNAMICTOP);
                            self.called = true;
                            assert(Runtime.dynamicAlloc);
                            self.alloc = Runtime.dynamicAlloc;
                            Runtime.dynamicAlloc = function() { abort("cannot dynamically allocate, sbrk now has control") }
                        }
                        var ret = DYNAMICTOP;
                        if (bytes != 0) self.alloc(bytes);
                        return ret
                    }
                    var _fabs = Math_abs;

                    function ___errno_location() { return ___errno_state }
                    var _BItoD = true;

                    function _copysign(a, b) { return __reallyNegative(a) === __reallyNegative(b) ? a : -a }

                    function _copysignl() { return _copysign.apply(null, arguments) }
                    var ___dso_handle = allocate(1, "i32*", ALLOC_STATIC);
                    var _stderr = allocate(1, "i32*", ALLOC_STATIC);
                    ___errno_state = Runtime.staticAlloc(4);
                    HEAP32[___errno_state >> 2] = 0;
                    _fputc.ret = allocate([0], "i8", ALLOC_STATIC);
                    STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);
                    staticSealed = true;
                    STACK_MAX = STACK_BASE + TOTAL_STACK;
                    DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);
                    assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");
                    var ctlz_i8 = allocate([8, 7, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "i8", ALLOC_DYNAMIC);
                    var cttz_i8 = allocate([8, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 7, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0], "i8", ALLOC_DYNAMIC);

                    function invoke_iiii(index, a1, a2, a3) {
                        try { return Module["dynCall_iiii"](index, a1, a2, a3) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }

                    function invoke_viiiii(index, a1, a2, a3, a4, a5) {
                        try { Module["dynCall_viiiii"](index, a1, a2, a3, a4, a5) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }

                    function invoke_vi(index, a1) {
                        try { Module["dynCall_vi"](index, a1) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }

                    function invoke_vii(index, a1, a2) {
                        try { Module["dynCall_vii"](index, a1, a2) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }

                    function invoke_ii(index, a1) {
                        try { return Module["dynCall_ii"](index, a1) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }

                    function invoke_v(index) {
                        try { Module["dynCall_v"](index) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }

                    function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
                        try { Module["dynCall_viiiiii"](index, a1, a2, a3, a4, a5, a6) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }

                    function invoke_iii(index, a1, a2) {
                        try { return Module["dynCall_iii"](index, a1, a2) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }

                    function invoke_viiii(index, a1, a2, a3, a4) {
                        try { Module["dynCall_viiii"](index, a1, a2, a3, a4) } catch (e) {
                            if (typeof e !== "number" && e !== "longjmp") throw e;
                            asm["setThrew"](1, 0)
                        }
                    }
                    Module.asmGlobalArg = { Math: Math, Int8Array: Int8Array, Int16Array: Int16Array, Int32Array: Int32Array, Uint8Array: Uint8Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array, Float32Array: Float32Array, Float64Array: Float64Array };
                    Module.asmLibraryArg = { abort: abort, assert: assert, min: Math_min, invoke_iiii: invoke_iiii, invoke_viiiii: invoke_viiiii, invoke_vi: invoke_vi, invoke_vii: invoke_vii, invoke_ii: invoke_ii, invoke_v: invoke_v, invoke_viiiiii: invoke_viiiiii, invoke_iii: invoke_iii, invoke_viiii: invoke_viiii, _fabs: _fabs, _llvm_pow_f64: _llvm_pow_f64, _send: _send, _fmod: _fmod, ___cxa_guard_acquire: ___cxa_guard_acquire, ___setErrNo: ___setErrNo, _vfprintf: _vfprintf, ___cxa_allocate_exception: ___cxa_allocate_exception, ___cxa_find_matching_catch: ___cxa_find_matching_catch, ___cxa_guard_release: ___cxa_guard_release, _pwrite: _pwrite, __reallyNegative: __reallyNegative, _sbrk: _sbrk, ___cxa_begin_catch: ___cxa_begin_catch, _emscripten_memcpy_big: _emscripten_memcpy_big, _fileno: _fileno, ___resumeException: ___resumeException, __ZSt18uncaught_exceptionv: __ZSt18uncaught_exceptionv, _sysconf: _sysconf, _pthread_getspecific: _pthread_getspecific, _atexit: _atexit, _pthread_once: _pthread_once, _puts: _puts, _printf: _printf, _pthread_key_create: _pthread_key_create, _write: _write, ___errno_location: ___errno_location, _pthread_setspecific: _pthread_setspecific, ___cxa_atexit: ___cxa_atexit, _copysign: _copysign, _fputc: _fputc, ___cxa_throw: ___cxa_throw, __exit: __exit, _copysignl: _copysignl, _abort: _abort, _fwrite: _fwrite, _time: _time, _fprintf: _fprintf, __formatString: __formatString, _fputs: _fputs, _exit: _exit, ___cxa_pure_virtual: ___cxa_pure_virtual, _fmodl: _fmodl, STACKTOP: STACKTOP, STACK_MAX: STACK_MAX, tempDoublePtr: tempDoublePtr, ABORT: ABORT, cttz_i8: cttz_i8, ctlz_i8: ctlz_i8, NaN: NaN, Infinity: Infinity, ___dso_handle: ___dso_handle, _stderr: _stderr };
                    var asm = function(global, env, buffer) {
                        "use asm";
                        var a = new global.Int8Array(buffer);
                        var b = new global.Int16Array(buffer);
                        var c = new global.Int32Array(buffer);
                        var d = new global.Uint8Array(buffer);
                        var e = new global.Uint16Array(buffer);
                        var f = new global.Uint32Array(buffer);
                        var g = new global.Float32Array(buffer);
                        var h = new global.Float64Array(buffer);
                        var i = env.STACKTOP | 0;
                        var j = env.STACK_MAX | 0;
                        var k = env.tempDoublePtr | 0;
                        var l = env.ABORT | 0;
                        var m = env.cttz_i8 | 0;
                        var n = env.ctlz_i8 | 0;
                        var o = env.___dso_handle | 0;
                        var p = env._stderr | 0;
                        var q = 0;
                        var r = 0;
                        var s = 0;
                        var t = 0;
                        var u = +env.NaN,
                            v = +env.Infinity;
                        var w = 0,
                            x = 0,
                            y = 0,
                            z = 0,
                            A = 0.0,
                            B = 0,
                            C = 0,
                            D = 0,
                            E = 0.0;
                        var F = 0;
                        var G = 0;
                        var H = 0;
                        var I = 0;
                        var J = 0;
                        var K = 0;
                        var L = 0;
                        var M = 0;
                        var N = 0;
                        var O = 0;
                        var P = global.Math.floor;
                        var Q = global.Math.abs;
                        var R = global.Math.sqrt;
                        var S = global.Math.pow;
                        var T = global.Math.cos;
                        var U = global.Math.sin;
                        var V = global.Math.tan;
                        var W = global.Math.acos;
                        var X = global.Math.asin;
                        var Y = global.Math.atan;
                        var Z = global.Math.atan2;
                        var _ = global.Math.exp;
                        var $ = global.Math.log;
                        var aa = global.Math.ceil;
                        var ba = global.Math.imul;
                        var ca = env.abort;
                        var da = env.assert;
                        var ea = env.min;
                        var fa = env.invoke_iiii;
                        var ga = env.invoke_viiiii;
                        var ha = env.invoke_vi;
                        var ia = env.invoke_vii;
                        var ja = env.invoke_ii;
                        var ka = env.invoke_v;
                        var la = env.invoke_viiiiii;
                        var ma = env.invoke_iii;
                        var na = env.invoke_viiii;
                        var oa = env._fabs;
                        var pa = env._llvm_pow_f64;
                        var qa = env._send;
                        var ra = env._fmod;
                        var sa = env.___cxa_guard_acquire;
                        var ta = env.___setErrNo;
                        var ua = env._vfprintf;
                        var va = env.___cxa_allocate_exception;
                        var wa = env.___cxa_find_matching_catch;
                        var xa = env.___cxa_guard_release;
                        var ya = env._pwrite;
                        var za = env.__reallyNegative;
                        var Aa = env._sbrk;
                        var Ba = env.___cxa_begin_catch;
                        var Ca = env._emscripten_memcpy_big;
                        var Da = env._fileno;
                        var Ea = env.___resumeException;
                        var Fa = env.__ZSt18uncaught_exceptionv;
                        var Ga = env._sysconf;
                        var Ha = env._pthread_getspecific;
                        var Ia = env._atexit;
                        var Ja = env._pthread_once;
                        var Ka = env._puts;
                        var La = env._printf;
                        var Ma = env._pthread_key_create;
                        var Na = env._write;
                        var Oa = env.___errno_location;
                        var Pa = env._pthread_setspecific;
                        var Qa = env.___cxa_atexit;
                        var Ra = env._copysign;
                        var Sa = env._fputc;
                        var Ta = env.___cxa_throw;
                        var Ua = env.__exit;
                        var Va = env._copysignl;
                        var Wa = env._abort;
                        var Xa = env._fwrite;
                        var Ya = env._time;
                        var Za = env._fprintf;
                        var _a = env.__formatString;
                        var $a = env._fputs;
                        var ab = env._exit;
                        var bb = env.___cxa_pure_virtual;
                        var cb = env._fmodl;
                        var db = 0.0;

                        function nb(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            i = i + a | 0;
                            i = i + 15 & -16;
                            return b | 0
                        }

                        function ob() { return i | 0 }

                        function pb(a) {
                            a = a | 0;
                            i = a
                        }

                        function qb(a, b) {
                            a = a | 0;
                            b = b | 0;
                            if (!q) {
                                q = a;
                                r = b
                            }
                        }

                        function rb(b) {
                            b = b | 0;
                            a[k >> 0] = a[b >> 0];
                            a[k + 1 >> 0] = a[b + 1 >> 0];
                            a[k + 2 >> 0] = a[b + 2 >> 0];
                            a[k + 3 >> 0] = a[b + 3 >> 0]
                        }

                        function sb(b) {
                            b = b | 0;
                            a[k >> 0] = a[b >> 0];
                            a[k + 1 >> 0] = a[b + 1 >> 0];
                            a[k + 2 >> 0] = a[b + 2 >> 0];
                            a[k + 3 >> 0] = a[b + 3 >> 0];
                            a[k + 4 >> 0] = a[b + 4 >> 0];
                            a[k + 5 >> 0] = a[b + 5 >> 0];
                            a[k + 6 >> 0] = a[b + 6 >> 0];
                            a[k + 7 >> 0] = a[b + 7 >> 0]
                        }

                        function tb(a) {
                            a = a | 0;
                            F = a
                        }

                        function ub() { return F | 0 }

                        function vb(a) {
                            a = a | 0;
                            Ba(a | 0) | 0;
                            ud()
                        }

                        function wb(a) { a = a | 0; return }

                        function xb(b, d, e, f, g) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            var h = 0;
                            h = i;
                            c[b >> 2] = 112;
                            c[b + 4 >> 2] = d;
                            c[b + 8 >> 2] = e;
                            c[b + 12 >> 2] = f;
                            c[b + 16 >> 2] = g;
                            if ((a[144] | 0) == 0 ? (sa(144) | 0) != 0 : 0) {
                                c[32] = 0;
                                c[33] = 0;
                                c[34] = 0;
                                Qa(19, 128, o | 0) | 0;
                                xa(144)
                            }
                            g = c[33] | 0;
                            if ((g | 0) == (c[34] | 0)) {
                                f = (g >> 1) + 2 & -2;
                                f = (f | 0) < 2 ? 2 : f;
                                if ((f | 0) > (2147483647 - g | 0)) {
                                    d = va(1) | 0;
                                    Ta(d | 0, 48, 0)
                                }
                                e = c[32] | 0;
                                d = f + g | 0;
                                c[34] = d;
                                d = Ud(e, d << 2) | 0;
                                c[32] = d;
                                if ((d | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    d = va(1) | 0;
                                    Ta(d | 0, 48, 0)
                                }
                                g = c[33] | 0
                            }
                            c[33] = g + 1;
                            g = (c[32] | 0) + (g << 2) | 0;
                            if (!g) { i = h; return }
                            c[g >> 2] = b;
                            i = h;
                            return
                        }

                        function yb(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            pd(a);
                            i = b;
                            return
                        }

                        function zb(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0;
                            b = i;
                            d = c[a >> 2] | 0;
                            if (!d) { i = b; return }
                            c[a + 4 >> 2] = 0;
                            Td(d);
                            c[a >> 2] = 0;
                            c[a + 8 >> 2] = 0;
                            i = b;
                            return
                        }

                        function Ab(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            pd(a);
                            i = b;
                            return
                        }

                        function Bb(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0;
                            e = i;
                            if ((a[d >> 0] | 0) != 45) {
                                k = 0;
                                i = e;
                                return k | 0
                            }
                            f = d + 1 | 0;
                            g = 110;
                            j = f;
                            k = 0;
                            while (1) {
                                h = k + 1 | 0;
                                if ((a[j >> 0] | 0) != g << 24 >> 24) { g = 1; break }
                                j = d + (k + 2) | 0;
                                if ((h | 0) == 3) {
                                    g = 0;
                                    f = j;
                                    break
                                } else {
                                    g = a[264 + h >> 0] | 0;
                                    k = h
                                }
                            }
                            if (ee(f, c[b + 4 >> 2] | 0) | 0) {
                                k = 0;
                                i = e;
                                return k | 0
                            }
                            a[b + 20 >> 0] = g;
                            k = 1;
                            i = e;
                            return k | 0
                        }

                        function Cb(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0;
                            h = i;
                            i = i + 16 | 0;
                            e = h;
                            f = c[p >> 2] | 0;
                            g = b + 4 | 0;
                            j = c[g >> 2] | 0;
                            c[e >> 2] = j;
                            c[e + 4 >> 2] = j;
                            Za(f | 0, 216, e | 0) | 0;
                            j = 0;
                            while (1) {
                                k = j >>> 0 < (32 - ((me(c[g >> 2] | 0) | 0) << 1) | 0) >>> 0;
                                Sa(32, f | 0) | 0;
                                if (k) j = j + 1 | 0;
                                else break
                            }
                            c[e >> 2] = (a[b + 20 >> 0] | 0) != 0 ? 248 : 256;
                            Za(f | 0, 232, e | 0) | 0;
                            if (!d) { i = h; return }
                            c[e >> 2] = c[b + 8 >> 2];
                            Za(f | 0, 88, e | 0) | 0;
                            Sa(10, f | 0) | 0;
                            i = h;
                            return
                        }

                        function Db(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            pd(a);
                            i = b;
                            return
                        }

                        function Eb(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0;
                            e = i;
                            i = i + 16 | 0;
                            h = e;
                            g = e + 8 | 0;
                            if ((a[d >> 0] | 0) != 45) {
                                n = 0;
                                i = e;
                                return n | 0
                            }
                            l = d + 1 | 0;
                            f = b + 4 | 0;
                            j = c[f >> 2] | 0;
                            k = a[j >> 0] | 0;
                            a: do {
                                if (k << 24 >> 24) {
                                    m = 0;
                                    while (1) {
                                        n = m;
                                        m = m + 1 | 0;
                                        if ((a[l >> 0] | 0) != k << 24 >> 24) { b = 0; break }
                                        k = a[j + m >> 0] | 0;
                                        l = d + (n + 2) | 0;
                                        if (!(k << 24 >> 24)) break a
                                    }
                                    i = e;
                                    return b | 0
                                }
                            } while (0);
                            if ((a[l >> 0] | 0) != 61) {
                                n = 0;
                                i = e;
                                return n | 0
                            }
                            d = l + 1 | 0;
                            j = de(d, g, 10) | 0;
                            if (!(c[g >> 2] | 0)) {
                                n = 0;
                                i = e;
                                return n | 0
                            }
                            if ((j | 0) > (c[b + 24 >> 2] | 0)) {
                                n = c[p >> 2] | 0;
                                m = c[f >> 2] | 0;
                                c[h >> 2] = d;
                                c[h + 4 >> 2] = m;
                                Za(n | 0, 416, h | 0) | 0;
                                ab(1)
                            }
                            if ((j | 0) < (c[b + 20 >> 2] | 0)) {
                                n = c[p >> 2] | 0;
                                m = c[f >> 2] | 0;
                                c[h >> 2] = d;
                                c[h + 4 >> 2] = m;
                                Za(n | 0, 472, h | 0) | 0;
                                ab(1)
                            }
                            c[b + 28 >> 2] = j;
                            n = 1;
                            i = e;
                            return n | 0
                        }

                        function Fb(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0;
                            d = i;
                            i = i + 16 | 0;
                            e = d;
                            f = c[p >> 2] | 0;
                            g = c[a + 16 >> 2] | 0;
                            c[e >> 2] = c[a + 4 >> 2];
                            c[e + 4 >> 2] = g;
                            Za(f | 0, 336, e | 0) | 0;
                            g = c[a + 20 >> 2] | 0;
                            if ((g | 0) == -2147483648) Xa(360, 4, 1, f | 0) | 0;
                            else {
                                c[e >> 2] = g;
                                Za(f | 0, 368, e | 0) | 0
                            }
                            Xa(376, 4, 1, f | 0) | 0;
                            g = c[a + 24 >> 2] | 0;
                            if ((g | 0) == 2147483647) Xa(384, 4, 1, f | 0) | 0;
                            else {
                                c[e >> 2] = g;
                                Za(f | 0, 368, e | 0) | 0
                            }
                            c[e >> 2] = c[a + 28 >> 2];
                            Za(f | 0, 392, e | 0) | 0;
                            if (!b) { i = d; return }
                            c[e >> 2] = c[a + 8 >> 2];
                            Za(f | 0, 88, e | 0) | 0;
                            Sa(10, f | 0) | 0;
                            i = d;
                            return
                        }

                        function Gb(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                j = 0;
                            g = i;
                            c[b >> 2] = 1816;
                            f = b + 4 | 0;
                            e = b + 32 | 0;
                            j = b + 48 | 0;
                            c[f + 0 >> 2] = 0;
                            c[f + 4 >> 2] = 0;
                            c[f + 8 >> 2] = 0;
                            c[f + 12 >> 2] = 0;
                            c[f + 16 >> 2] = 0;
                            c[f + 20 >> 2] = 0;
                            c[e + 0 >> 2] = 0;
                            c[e + 4 >> 2] = 0;
                            c[e + 8 >> 2] = 0;
                            c[e + 12 >> 2] = 0;
                            h[j >> 3] = +h[75];
                            h[b + 56 >> 3] = +h[89];
                            h[b + 64 >> 3] = +h[103];
                            h[b + 72 >> 3] = +h[123];
                            a[b + 80 >> 0] = a[1364] | 0;
                            c[b + 84 >> 2] = c[269];
                            c[b + 88 >> 2] = c[297];
                            a[b + 92 >> 0] = 0;
                            a[b + 93 >> 0] = a[1292] | 0;
                            h[b + 96 >> 3] = +h[204];
                            c[b + 104 >> 2] = c[439];
                            c[b + 108 >> 2] = c[359];
                            h[b + 112 >> 3] = +h[191];
                            h[b + 120 >> 3] = .3333333333333333;
                            h[b + 128 >> 3] = 1.1;
                            c[b + 136 >> 2] = 100;
                            h[b + 144 >> 3] = 1.5;
                            j = b + 316 | 0;
                            c[b + 332 >> 2] = 0;
                            c[b + 336 >> 2] = 0;
                            c[b + 340 >> 2] = 0;
                            c[b + 348 >> 2] = 0;
                            c[b + 352 >> 2] = 0;
                            c[b + 356 >> 2] = 0;
                            c[b + 364 >> 2] = 0;
                            c[b + 368 >> 2] = 0;
                            c[b + 372 >> 2] = 0;
                            c[b + 380 >> 2] = 0;
                            c[b + 384 >> 2] = 0;
                            c[b + 388 >> 2] = 0;
                            c[b + 396 >> 2] = 0;
                            c[b + 400 >> 2] = 0;
                            c[b + 404 >> 2] = 0;
                            e = b + 544 | 0;
                            c[b + 412 >> 2] = 0;
                            c[b + 416 >> 2] = 0;
                            c[b + 420 >> 2] = 0;
                            c[b + 428 >> 2] = 0;
                            c[b + 432 >> 2] = 0;
                            c[b + 436 >> 2] = 0;
                            c[b + 444 >> 2] = 0;
                            c[b + 448 >> 2] = 0;
                            c[b + 452 >> 2] = 0;
                            ke(b + 152 | 0, 0, 176) | 0;
                            c[b + 456 >> 2] = e;
                            f = b + 460 | 0;
                            c[f + 0 >> 2] = 0;
                            c[f + 4 >> 2] = 0;
                            c[f + 8 >> 2] = 0;
                            c[f + 12 >> 2] = 0;
                            c[f + 16 >> 2] = 0;
                            c[f + 20 >> 2] = 0;
                            c[b + 488 >> 2] = j;
                            a[b + 492 >> 0] = 1;
                            h[b + 496 >> 3] = 1.0;
                            h[b + 504 >> 3] = 1.0;
                            c[b + 512 >> 2] = 0;
                            c[b + 516 >> 2] = -1;
                            j = b + 520 | 0;
                            f = b + 536 | 0;
                            c[j + 0 >> 2] = 0;
                            c[j + 4 >> 2] = 0;
                            c[j + 8 >> 2] = 0;
                            c[j + 12 >> 2] = 0;
                            a[f >> 0] = 1;
                            f = b + 540 | 0;
                            c[f + 0 >> 2] = 0;
                            c[f + 4 >> 2] = 0;
                            c[f + 8 >> 2] = 0;
                            c[f + 12 >> 2] = 0;
                            c[f + 16 >> 2] = 0;
                            gc(e, 1048576);
                            a[b + 560 >> 0] = 0;
                            e = b + 604 | 0;
                            f = b + 664 | 0;
                            j = b + 564 | 0;
                            d = j + 36 | 0;
                            do {
                                c[j >> 2] = 0;
                                j = j + 4 | 0
                            } while ((j | 0) < (d | 0));
                            j = e + 0 | 0;
                            d = j + 36 | 0;
                            do {
                                c[j >> 2] = 0;
                                j = j + 4 | 0
                            } while ((j | 0) < (d | 0));
                            j = b + 680 | 0;
                            c[f + 0 >> 2] = -1;
                            c[f + 4 >> 2] = -1;
                            c[f + 8 >> 2] = -1;
                            c[f + 12 >> 2] = -1;
                            a[j >> 0] = 0;
                            i = g;
                            return
                        }

                        function Hb(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            Ib(a);
                            pd(a);
                            i = b;
                            return
                        }

                        function Ib(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0,
                                e = 0;
                            b = i;
                            c[a >> 2] = 1816;
                            d = a + 628 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 632 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 636 >> 2] = 0
                            }
                            d = a + 616 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 620 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 624 >> 2] = 0
                            }
                            d = a + 604 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 608 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 612 >> 2] = 0
                            }
                            d = a + 588 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 592 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 596 >> 2] = 0
                            }
                            d = a + 576 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 580 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 584 >> 2] = 0
                            }
                            d = a + 564 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 568 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 572 >> 2] = 0
                            }
                            d = c[a + 544 >> 2] | 0;
                            if (d) Td(d);
                            d = a + 472 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 476 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 480 >> 2] = 0
                            }
                            d = a + 460 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 464 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 468 >> 2] = 0
                            }
                            hc(a + 412 | 0);
                            d = a + 396 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 400 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 404 >> 2] = 0
                            }
                            d = a + 380 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 384 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 388 >> 2] = 0
                            }
                            e = a + 364 | 0;
                            d = c[e >> 2] | 0;
                            if (d) {
                                c[a + 368 >> 2] = 0;
                                Td(d);
                                c[e >> 2] = 0;
                                c[a + 372 >> 2] = 0
                            }
                            d = a + 348 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 352 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 356 >> 2] = 0
                            }
                            d = a + 332 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 336 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 340 >> 2] = 0
                            }
                            d = a + 316 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 320 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 324 >> 2] = 0
                            }
                            d = a + 304 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 308 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 312 >> 2] = 0
                            }
                            d = a + 292 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 296 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 300 >> 2] = 0
                            }
                            d = a + 280 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 284 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 288 >> 2] = 0
                            }
                            d = a + 268 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 272 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 276 >> 2] = 0
                            }
                            d = a + 256 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 260 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 264 >> 2] = 0
                            }
                            d = a + 32 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 36 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 40 >> 2] = 0
                            }
                            d = a + 16 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 20 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 24 >> 2] = 0
                            }
                            e = a + 4 | 0;
                            d = c[e >> 2] | 0;
                            if (!d) { i = b; return }
                            c[a + 8 >> 2] = 0;
                            Td(d);
                            c[e >> 2] = 0;
                            c[a + 12 >> 2] = 0;
                            i = b;
                            return
                        }

                        function Jb(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                j = 0,
                                k = 0,
                                l = 0.0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0;
                            f = i;
                            i = i + 16 | 0;
                            k = f + 4 | 0;
                            j = f;
                            g = b + 580 | 0;
                            m = c[g >> 2] | 0;
                            if ((m | 0) > 0) {
                                o = m + -1 | 0;
                                p = c[(c[b + 576 >> 2] | 0) + (o << 2) >> 2] | 0;
                                c[g >> 2] = o;
                                g = p
                            } else {
                                p = b + 540 | 0;
                                g = c[p >> 2] | 0;
                                c[p >> 2] = g + 1
                            }
                            m = b + 412 | 0;
                            p = g << 1;
                            c[k >> 2] = p;
                            ic(m, k);
                            c[j >> 2] = p | 1;
                            ic(m, j);
                            k = b + 332 | 0;
                            m = a[544] | 0;
                            j = g + 1 | 0;
                            jc(k, j);
                            a[(c[k >> 2] | 0) + g >> 0] = m;
                            k = b + 396 | 0;
                            m = b + 400 | 0;
                            if ((c[m >> 2] | 0) < (j | 0)) {
                                o = b + 404 | 0;
                                p = c[o >> 2] | 0;
                                if ((p | 0) < (j | 0)) {
                                    q = g + 2 - p & -2;
                                    n = (p >> 1) + 2 & -2;
                                    n = (q | 0) > (n | 0) ? q : n;
                                    if ((n | 0) > (2147483647 - p | 0)) {
                                        q = va(1) | 0;
                                        Ta(q | 0, 48, 0)
                                    }
                                    r = c[k >> 2] | 0;
                                    q = n + p | 0;
                                    c[o >> 2] = q;
                                    q = Ud(r, q << 3) | 0;
                                    c[k >> 2] = q;
                                    if ((q | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        r = va(1) | 0;
                                        Ta(r | 0, 48, 0)
                                    }
                                }
                                o = c[m >> 2] | 0;
                                if ((o | 0) < (j | 0))
                                    do {
                                        n = (c[k >> 2] | 0) + (o << 3) | 0;
                                        if (n) {
                                            r = n;
                                            c[r >> 2] = 0;
                                            c[r + 4 >> 2] = 0
                                        }
                                        o = o + 1 | 0
                                    } while ((o | 0) != (j | 0));
                                c[m >> 2] = j
                            }
                            m = (c[k >> 2] | 0) + (g << 3) | 0;
                            c[m >> 2] = -1;
                            c[m + 4 >> 2] = 0;
                            m = b + 316 | 0;
                            if (!(a[b + 93 >> 0] | 0)) l = 0.0;
                            else {
                                r = b + 72 | 0;
                                l = +h[r >> 3] * 1389796.0;
                                l = l - +(~~(l / 2147483647.0) | 0) * 2147483647.0;
                                h[r >> 3] = l;
                                l = l / 2147483647.0 * 1.0e-5
                            }
                            k = b + 320 | 0;
                            if ((c[k >> 2] | 0) < (j | 0)) {
                                n = b + 324 | 0;
                                o = c[n >> 2] | 0;
                                if ((o | 0) < (j | 0)) {
                                    r = g + 2 - o & -2;
                                    p = (o >> 1) + 2 & -2;
                                    p = (r | 0) > (p | 0) ? r : p;
                                    if ((p | 0) > (2147483647 - o | 0)) {
                                        r = va(1) | 0;
                                        Ta(r | 0, 48, 0)
                                    }
                                    q = c[m >> 2] | 0;
                                    r = p + o | 0;
                                    c[n >> 2] = r;
                                    r = Ud(q, r << 3) | 0;
                                    c[m >> 2] = r;
                                    if ((r | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        r = va(1) | 0;
                                        Ta(r | 0, 48, 0)
                                    }
                                }
                                p = c[k >> 2] | 0;
                                if ((p | 0) < (j | 0)) {
                                    n = c[m >> 2] | 0;
                                    do {
                                        o = n + (p << 3) | 0;
                                        if (o) h[o >> 3] = 0.0;
                                        p = p + 1 | 0
                                    } while ((p | 0) != (j | 0))
                                }
                                c[k >> 2] = j
                            }
                            h[(c[m >> 2] | 0) + (g << 3) >> 3] = l;
                            kc(b + 588 | 0, g, 0);
                            kc(b + 348 | 0, g, 1);
                            k = b + 364 | 0;
                            d = a[d >> 0] | 0;
                            jc(k, j);
                            a[(c[k >> 2] | 0) + g >> 0] = d;
                            k = b + 380 | 0;
                            d = b + 384 | 0;
                            if ((c[d >> 2] | 0) < (j | 0)) {
                                m = b + 388 | 0;
                                o = c[m >> 2] | 0;
                                if ((o | 0) < (j | 0)) {
                                    r = g + 2 - o & -2;
                                    n = (o >> 1) + 2 & -2;
                                    n = (r | 0) > (n | 0) ? r : n;
                                    if ((n | 0) > (2147483647 - o | 0)) {
                                        r = va(1) | 0;
                                        Ta(r | 0, 48, 0)
                                    }
                                    q = c[k >> 2] | 0;
                                    r = n + o | 0;
                                    c[m >> 2] = r;
                                    r = Ud(q, r) | 0;
                                    c[k >> 2] = r;
                                    if ((r | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        r = va(1) | 0;
                                        Ta(r | 0, 48, 0)
                                    }
                                }
                                m = c[d >> 2] | 0;
                                if ((m | 0) < (j | 0))
                                    do {
                                        n = (c[k >> 2] | 0) + m | 0;
                                        if (n) a[n >> 0] = 0;
                                        m = m + 1 | 0
                                    } while ((m | 0) != (j | 0));
                                c[d >> 2] = j
                            }
                            d = b + 288 | 0;
                            k = c[d >> 2] | 0;
                            if ((k | 0) < (j | 0)) {
                                r = g + 2 - k & -2;
                                j = (k >> 1) + 2 & -2;
                                j = (r | 0) > (j | 0) ? r : j;
                                if ((j | 0) > (2147483647 - k | 0)) {
                                    r = va(1) | 0;
                                    Ta(r | 0, 48, 0)
                                }
                                q = b + 280 | 0;
                                p = c[q >> 2] | 0;
                                r = j + k | 0;
                                c[d >> 2] = r;
                                r = Ud(p, r << 2) | 0;
                                c[q >> 2] = r;
                                if ((r | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    r = va(1) | 0;
                                    Ta(r | 0, 48, 0)
                                }
                            }
                            j = b + 380 | 0;
                            d = (c[j >> 2] | 0) + g | 0;
                            k = (a[d >> 0] | 0) == 0;
                            if (e) {
                                if (k) {
                                    r = b + 200 | 0;
                                    q = r;
                                    q = ne(c[q >> 2] | 0, c[q + 4 >> 2] | 0, 1, 0) | 0;
                                    c[r >> 2] = q;
                                    c[r + 4 >> 2] = F
                                }
                            } else if (!k) {
                                r = b + 200 | 0;
                                q = r;
                                q = ne(c[q >> 2] | 0, c[q + 4 >> 2] | 0, -1, -1) | 0;
                                c[r >> 2] = q;
                                c[r + 4 >> 2] = F
                            }
                            a[d >> 0] = e & 1;
                            e = b + 460 | 0;
                            if ((c[b + 476 >> 2] | 0) > (g | 0) ? (c[(c[b + 472 >> 2] | 0) + (g << 2) >> 2] | 0) > -1 : 0) { i = f; return g | 0 }
                            if (!(a[(c[j >> 2] | 0) + g >> 0] | 0)) { i = f; return g | 0 }
                            lc(e, g);
                            i = f;
                            return g | 0
                        }

                        function Kb(b, e) {
                            b = b | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0;
                            f = i;
                            i = i + 16 | 0;
                            k = f + 1 | 0;
                            j = f;
                            g = b + 492 | 0;
                            if (!(a[g >> 0] | 0)) {
                                s = 0;
                                i = f;
                                return s | 0
                            }
                            s = c[e >> 2] | 0;
                            h = e + 4 | 0;
                            l = c[h >> 2] | 0;
                            a[k + 0 >> 0] = a[j + 0 >> 0] | 0;
                            oc(s, l, k);
                            l = c[h >> 2] | 0;
                            a: do {
                                if ((l | 0) > 0) {
                                    k = b + 332 | 0;
                                    j = a[528] | 0;
                                    m = 0;
                                    n = 0;
                                    p = -2;
                                    while (1) {
                                        s = c[e >> 2] | 0;
                                        o = c[s + (m << 2) >> 2] | 0;
                                        r = d[(c[k >> 2] | 0) + (o >> 1) >> 0] | 0;
                                        t = r ^ o & 1;
                                        q = t & 255;
                                        u = j & 255;
                                        if ((o | 0) == (p ^ 1 | 0) ? 1 : (q << 24 >> 24 == j << 24 >> 24 & (u >>> 1 ^ 1) | u & 2 & t | 0) != 0) { b = 1; break }
                                        t = a[536] | 0;
                                        u = t & 255;
                                        if ((o | 0) != (p | 0) ? ((u >>> 1 ^ 1) & q << 24 >> 24 == t << 24 >> 24 | r & 2 & u | 0) == 0 : 0) {
                                            c[s + (n << 2) >> 2] = o;
                                            l = c[h >> 2] | 0;
                                            n = n + 1 | 0
                                        } else o = p;
                                        m = m + 1 | 0;
                                        if ((m | 0) < (l | 0)) p = o;
                                        else break a
                                    }
                                    i = f;
                                    return b | 0
                                } else {
                                    m = 0;
                                    n = 0
                                }
                            } while (0);
                            j = m - n | 0;
                            if ((j | 0) > 0) {
                                l = l - j | 0;
                                c[h >> 2] = l
                            }
                            if (!l) {
                                a[g >> 0] = 0;
                                u = 0;
                                i = f;
                                return u | 0
                            } else if ((l | 0) == 1) {
                                t = c[c[e >> 2] >> 2] | 0;
                                s = t >> 1;
                                a[(c[b + 332 >> 2] | 0) + s >> 0] = (t & 1 ^ 1) & 255 ^ 1;
                                u = c[b + 296 >> 2] | 0;
                                s = (c[b + 396 >> 2] | 0) + (s << 3) | 0;
                                c[s >> 2] = -1;
                                c[s + 4 >> 2] = u;
                                s = b + 284 | 0;
                                u = c[s >> 2] | 0;
                                c[s >> 2] = u + 1;
                                c[(c[b + 280 >> 2] | 0) + (u << 2) >> 2] = t;
                                u = (Mb(b) | 0) == -1;
                                a[g >> 0] = u & 1;
                                i = f;
                                return u | 0
                            } else {
                                e = pc(b + 544 | 0, e, 0) | 0;
                                h = b + 256 | 0;
                                g = b + 260 | 0;
                                k = c[g >> 2] | 0;
                                j = b + 264 | 0;
                                if ((k | 0) == (c[j >> 2] | 0)) {
                                    l = (k >> 1) + 2 & -2;
                                    l = (l | 0) < 2 ? 2 : l;
                                    if ((l | 0) > (2147483647 - k | 0)) {
                                        u = va(1) | 0;
                                        Ta(u | 0, 48, 0)
                                    }
                                    t = c[h >> 2] | 0;
                                    u = l + k | 0;
                                    c[j >> 2] = u;
                                    u = Ud(t, u << 2) | 0;
                                    c[h >> 2] = u;
                                    if ((u | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        u = va(1) | 0;
                                        Ta(u | 0, 48, 0)
                                    }
                                    k = c[g >> 2] | 0
                                }
                                c[g >> 2] = k + 1;
                                g = (c[h >> 2] | 0) + (k << 2) | 0;
                                if (g) c[g >> 2] = e;
                                Nb(b, e);
                                u = 1;
                                i = f;
                                return u | 0
                            }
                            return 0
                        }

                        function Lb(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0;
                            f = c[d >> 2] | 0;
                            d = f >> 1;
                            a[(c[b + 332 >> 2] | 0) + d >> 0] = (f & 1 ^ 1) & 255 ^ 1;
                            g = c[b + 296 >> 2] | 0;
                            d = (c[b + 396 >> 2] | 0) + (d << 3) | 0;
                            c[d >> 2] = e;
                            c[d + 4 >> 2] = g;
                            e = b + 284 | 0;
                            d = c[e >> 2] | 0;
                            c[e >> 2] = d + 1;
                            c[(c[b + 280 >> 2] | 0) + (d << 2) >> 2] = f;
                            return
                        }

                        function Mb(b) {
                            b = b | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0,
                                A = 0,
                                B = 0,
                                C = 0,
                                D = 0,
                                E = 0,
                                G = 0,
                                H = 0,
                                I = 0,
                                J = 0,
                                K = 0,
                                L = 0,
                                M = 0,
                                N = 0,
                                O = 0,
                                P = 0;
                            k = i;
                            i = i + 16 | 0;
                            r = k;
                            h = b + 512 | 0;
                            t = c[h >> 2] | 0;
                            q = b + 284 | 0;
                            if ((t | 0) >= (c[q >> 2] | 0)) {
                                M = 0;
                                K = 0;
                                O = -1;
                                N = b + 184 | 0;
                                I = N;
                                L = I;
                                L = c[L >> 2] | 0;
                                I = I + 4 | 0;
                                I = c[I >> 2] | 0;
                                I = ne(L | 0, I | 0, M | 0, K | 0) | 0;
                                L = F;
                                J = N;
                                c[J >> 2] = I;
                                N = N + 4 | 0;
                                c[N >> 2] = L;
                                N = b + 520 | 0;
                                L = N;
                                J = L;
                                J = c[J >> 2] | 0;
                                L = L + 4 | 0;
                                L = c[L >> 2] | 0;
                                K = je(J | 0, L | 0, M | 0, K | 0) | 0;
                                M = F;
                                L = N;
                                c[L >> 2] = K;
                                N = N + 4 | 0;
                                c[N >> 2] = M;
                                i = k;
                                return O | 0
                            }
                            o = b + 280 | 0;
                            j = b + 428 | 0;
                            g = b + 412 | 0;
                            l = b + 332 | 0;
                            m = b + 544 | 0;
                            n = r + 4 | 0;
                            e = b + 396 | 0;
                            p = b + 296 | 0;
                            f = b + 456 | 0;
                            z = -1;
                            s = 0;
                            do {
                                c[h >> 2] = t + 1;
                                w = c[(c[o >> 2] | 0) + (t << 2) >> 2] | 0;
                                if (a[(c[j >> 2] | 0) + w >> 0] | 0) {
                                    u = c[g >> 2] | 0;
                                    t = u + (w * 12 | 0) + 4 | 0;
                                    y = c[t >> 2] | 0;
                                    if ((y | 0) > 0) {
                                        u = u + (w * 12 | 0) | 0;
                                        v = 0;
                                        x = 0;
                                        do {
                                            B = c[u >> 2] | 0;
                                            A = B + (v << 3) | 0;
                                            if ((c[(c[c[f >> 2] >> 2] | 0) + (c[A >> 2] << 2) >> 2] & 3 | 0) != 1) {
                                                N = A;
                                                O = c[N + 4 >> 2] | 0;
                                                y = B + (x << 3) | 0;
                                                c[y >> 2] = c[N >> 2];
                                                c[y + 4 >> 2] = O;
                                                y = c[t >> 2] | 0;
                                                x = x + 1 | 0
                                            }
                                            v = v + 1 | 0
                                        } while ((v | 0) < (y | 0))
                                    } else {
                                        v = 0;
                                        x = 0
                                    }
                                    u = v - x | 0;
                                    if ((u | 0) > 0) c[t >> 2] = y - u;
                                    a[(c[j >> 2] | 0) + w >> 0] = 0
                                }
                                t = c[g >> 2] | 0;
                                s = s + 1 | 0;
                                u = c[t + (w * 12 | 0) >> 2] | 0;
                                t = t + (w * 12 | 0) + 4 | 0;
                                x = c[t >> 2] | 0;
                                v = u + (x << 3) | 0;
                                a: do {
                                    if (!x) {
                                        v = u;
                                        y = u
                                    } else {
                                        w = w ^ 1;
                                        x = (x << 3) + -1 | 0;
                                        B = u;
                                        y = u;
                                        while (1) {
                                            while (1) {
                                                b: while (1) {
                                                    H = c[B + 4 >> 2] | 0;
                                                    O = d[(c[l >> 2] | 0) + (H >> 1) >> 0] ^ H & 1;
                                                    J = a[528] | 0;
                                                    I = J & 255;
                                                    K = I & 2;
                                                    I = I >>> 1 ^ 1;
                                                    if ((O & 255) << 24 >> 24 == J << 24 >> 24 & I | K & O) { E = 19; break }
                                                    A = c[B >> 2] | 0;
                                                    E = c[m >> 2] | 0;
                                                    G = E + (A << 2) | 0;
                                                    C = E + (A + 1 << 2) | 0;
                                                    D = c[C >> 2] | 0;
                                                    if ((D | 0) == (w | 0)) {
                                                        O = E + (A + 2 << 2) | 0;
                                                        D = c[O >> 2] | 0;
                                                        c[C >> 2] = D;
                                                        c[O >> 2] = w
                                                    }
                                                    C = B + 8 | 0;
                                                    c[r >> 2] = A;
                                                    c[n >> 2] = D;
                                                    if ((D | 0) != (H | 0) ? (O = d[(c[l >> 2] | 0) + (D >> 1) >> 0] ^ D & 1, ((O & 255) << 24 >> 24 == J << 24 >> 24 & I | K & O | 0) != 0) : 0) { E = 27; break }
                                                    K = c[G >> 2] | 0;
                                                    if (K >>> 0 <= 95) { E = 31; break }
                                                    I = c[l >> 2] | 0;
                                                    J = a[536] | 0;
                                                    H = J & 255;
                                                    O = H & 2;
                                                    H = H >>> 1 ^ 1;
                                                    N = 2;
                                                    while (1) {
                                                        L = G + (N << 2) + 4 | 0;
                                                        M = c[L >> 2] | 0;
                                                        P = d[I + (M >> 1) >> 0] ^ M & 1;
                                                        N = N + 1 | 0;
                                                        if (!((P & 255) << 24 >> 24 == J << 24 >> 24 & H | O & P)) break;
                                                        if ((N | 0) >= (K >>> 5 | 0)) { E = 32; break b }
                                                    }
                                                    P = E + (A + 2 << 2) | 0;
                                                    c[P >> 2] = M;
                                                    c[L >> 2] = w;
                                                    qc((c[g >> 2] | 0) + ((c[P >> 2] ^ 1) * 12 | 0) | 0, r);
                                                    if ((C | 0) == (v | 0)) break a;
                                                    else B = C
                                                }
                                                if ((E | 0) == 19) {
                                                    E = 0;
                                                    N = B;
                                                    O = c[N + 4 >> 2] | 0;
                                                    P = y;
                                                    c[P >> 2] = c[N >> 2];
                                                    c[P + 4 >> 2] = O;
                                                    B = B + 8 | 0;
                                                    y = y + 8 | 0
                                                } else if ((E | 0) == 27) {
                                                    E = 0;
                                                    O = r;
                                                    P = c[O + 4 >> 2] | 0;
                                                    B = y;
                                                    c[B >> 2] = c[O >> 2];
                                                    c[B + 4 >> 2] = P;
                                                    B = C;
                                                    y = y + 8 | 0
                                                } else if ((E | 0) == 31) {
                                                    J = a[536] | 0;
                                                    E = 32
                                                }
                                                if ((E | 0) == 32) {
                                                    E = y + 8 | 0;
                                                    G = r;
                                                    I = c[G + 4 >> 2] | 0;
                                                    H = y;
                                                    c[H >> 2] = c[G >> 2];
                                                    c[H + 4 >> 2] = I;
                                                    H = D >> 1;
                                                    I = D & 1;
                                                    G = (c[l >> 2] | 0) + H | 0;
                                                    P = d[G >> 0] ^ I;
                                                    O = J & 255;
                                                    if ((P & 255) << 24 >> 24 == J << 24 >> 24 & (O >>> 1 ^ 1) | O & 2 & P) break;
                                                    a[G >> 0] = (I ^ 1) & 255 ^ 1;
                                                    y = c[p >> 2] | 0;
                                                    B = (c[e >> 2] | 0) + (H << 3) | 0;
                                                    c[B >> 2] = A;
                                                    c[B + 4 >> 2] = y;
                                                    B = c[q >> 2] | 0;
                                                    c[q >> 2] = B + 1;
                                                    c[(c[o >> 2] | 0) + (B << 2) >> 2] = D;
                                                    B = C;
                                                    y = E
                                                }
                                                if ((B | 0) == (v | 0)) break a
                                            }
                                            c[h >> 2] = c[q >> 2];
                                            if (C >>> 0 < v >>> 0) {
                                                z = (u + (x - C) | 0) >>> 3;
                                                while (1) {
                                                    N = C;
                                                    C = C + 8 | 0;
                                                    O = c[N + 4 >> 2] | 0;
                                                    P = E;
                                                    c[P >> 2] = c[N >> 2];
                                                    c[P + 4 >> 2] = O;
                                                    if (C >>> 0 >= v >>> 0) break;
                                                    else E = E + 8 | 0
                                                }
                                                B = B + (z + 2 << 3) | 0;
                                                y = y + (z + 2 << 3) | 0
                                            } else {
                                                B = C;
                                                y = E
                                            }
                                            if ((B | 0) == (v | 0)) { z = A; break } else z = A
                                        }
                                    }
                                } while (0);
                                u = v - y | 0;
                                if ((u | 0) > 0) c[t >> 2] = (c[t >> 2] | 0) - (u >> 3);
                                t = c[h >> 2] | 0
                            } while ((t | 0) < (c[q >> 2] | 0));
                            N = s;
                            L = ((s | 0) < 0) << 31 >> 31;
                            P = z;
                            O = b + 184 | 0;
                            J = O;
                            M = J;
                            M = c[M >> 2] | 0;
                            J = J + 4 | 0;
                            J = c[J >> 2] | 0;
                            J = ne(M | 0, J | 0, N | 0, L | 0) | 0;
                            M = F;
                            K = O;
                            c[K >> 2] = J;
                            O = O + 4 | 0;
                            c[O >> 2] = M;
                            O = b + 520 | 0;
                            M = O;
                            K = M;
                            K = c[K >> 2] | 0;
                            M = M + 4 | 0;
                            M = c[M >> 2] | 0;
                            L = je(K | 0, M | 0, N | 0, L | 0) | 0;
                            N = F;
                            M = O;
                            c[M >> 2] = L;
                            O = O + 4 | 0;
                            c[O >> 2] = N;
                            i = k;
                            return P | 0
                        }

                        function Nb(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            d = i;
                            i = i + 16 | 0;
                            k = d + 8 | 0;
                            f = d;
                            g = c[a + 544 >> 2] | 0;
                            e = g + (b << 2) | 0;
                            h = g + (b + 1 << 2) | 0;
                            j = a + 412 | 0;
                            l = (c[j >> 2] | 0) + ((c[h >> 2] ^ 1) * 12 | 0) | 0;
                            g = g + (b + 2 << 2) | 0;
                            m = c[g >> 2] | 0;
                            c[k >> 2] = b;
                            c[k + 4 >> 2] = m;
                            qc(l, k);
                            g = (c[j >> 2] | 0) + ((c[g >> 2] ^ 1) * 12 | 0) | 0;
                            h = c[h >> 2] | 0;
                            c[f >> 2] = b;
                            c[f + 4 >> 2] = h;
                            qc(g, f);
                            if (!(c[e >> 2] & 4)) {
                                m = a + 208 | 0;
                                l = m;
                                l = ne(c[l >> 2] | 0, c[l + 4 >> 2] | 0, 1, 0) | 0;
                                c[m >> 2] = l;
                                c[m + 4 >> 2] = F;
                                m = a + 224 | 0;
                                l = m;
                                l = ne((c[e >> 2] | 0) >>> 5 | 0, 0, c[l >> 2] | 0, c[l + 4 >> 2] | 0) | 0;
                                c[m >> 2] = l;
                                c[m + 4 >> 2] = F;
                                i = d;
                                return
                            } else {
                                m = a + 216 | 0;
                                l = m;
                                l = ne(c[l >> 2] | 0, c[l + 4 >> 2] | 0, 1, 0) | 0;
                                c[m >> 2] = l;
                                c[m + 4 >> 2] = F;
                                m = a + 232 | 0;
                                l = m;
                                l = ne((c[e >> 2] | 0) >>> 5 | 0, 0, c[l >> 2] | 0, c[l + 4 >> 2] | 0) | 0;
                                c[m >> 2] = l;
                                c[m + 4 >> 2] = F;
                                i = d;
                                return
                            }
                        }

                        function Ob(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0;
                            g = i;
                            i = i + 16 | 0;
                            l = g + 4 | 0;
                            j = g;
                            h = c[b + 544 >> 2] | 0;
                            f = h + (d << 2) | 0;
                            k = c[h + (d + 1 << 2) >> 2] ^ 1;
                            if (!e) {
                                c[l >> 2] = k;
                                e = b + 428 | 0;
                                m = c[e >> 2] | 0;
                                k = m + k | 0;
                                if (!(a[k >> 0] | 0)) {
                                    a[k >> 0] = 1;
                                    mc(b + 444 | 0, l);
                                    m = c[e >> 2] | 0
                                }
                                d = c[h + (d + 2 << 2) >> 2] ^ 1;
                                c[j >> 2] = d;
                                d = m + d | 0;
                                if (!(a[d >> 0] | 0)) {
                                    a[d >> 0] = 1;
                                    mc(b + 444 | 0, j)
                                }
                            } else {
                                j = b + 412 | 0;
                                e = c[j >> 2] | 0;
                                l = e + (k * 12 | 0) | 0;
                                h = h + (d + 2 << 2) | 0;
                                k = e + (k * 12 | 0) + 4 | 0;
                                m = c[k >> 2] | 0;
                                a: do {
                                    if ((m | 0) > 0) {
                                        p = c[l >> 2] | 0;
                                        o = 0;
                                        while (1) {
                                            n = o + 1 | 0;
                                            if ((c[p + (o << 3) >> 2] | 0) == (d | 0)) { n = o; break a }
                                            if ((n | 0) < (m | 0)) o = n;
                                            else break
                                        }
                                    } else n = 0
                                } while (0);
                                m = m + -1 | 0;
                                if ((n | 0) < (m | 0)) {
                                    do {
                                        e = c[l >> 2] | 0;
                                        m = n;
                                        n = n + 1 | 0;
                                        o = e + (n << 3) | 0;
                                        p = c[o + 4 >> 2] | 0;
                                        m = e + (m << 3) | 0;
                                        c[m >> 2] = c[o >> 2];
                                        c[m + 4 >> 2] = p;
                                        m = (c[k >> 2] | 0) + -1 | 0
                                    } while ((n | 0) < (m | 0));
                                    e = c[j >> 2] | 0
                                }
                                c[k >> 2] = m;
                                j = c[h >> 2] ^ 1;
                                h = e + (j * 12 | 0) | 0;
                                j = e + (j * 12 | 0) + 4 | 0;
                                k = c[j >> 2] | 0;
                                b: do {
                                    if ((k | 0) > 0) {
                                        e = c[h >> 2] | 0;
                                        m = 0;
                                        while (1) {
                                            l = m + 1 | 0;
                                            if ((c[e + (m << 3) >> 2] | 0) == (d | 0)) { l = m; break b }
                                            if ((l | 0) < (k | 0)) m = l;
                                            else break
                                        }
                                    } else l = 0
                                } while (0);
                                d = k + -1 | 0;
                                if ((l | 0) < (d | 0))
                                    do {
                                        n = c[h >> 2] | 0;
                                        d = l;
                                        l = l + 1 | 0;
                                        o = n + (l << 3) | 0;
                                        p = c[o + 4 >> 2] | 0;
                                        d = n + (d << 3) | 0;
                                        c[d >> 2] = c[o >> 2];
                                        c[d + 4 >> 2] = p;
                                        d = (c[j >> 2] | 0) + -1 | 0
                                    } while ((l | 0) < (d | 0));
                                c[j >> 2] = d
                            }
                            if (!(c[f >> 2] & 4)) {
                                p = b + 208 | 0;
                                o = p;
                                o = ne(c[o >> 2] | 0, c[o + 4 >> 2] | 0, -1, -1) | 0;
                                c[p >> 2] = o;
                                c[p + 4 >> 2] = F;
                                p = b + 224 | 0;
                                o = p;
                                o = je(c[o >> 2] | 0, c[o + 4 >> 2] | 0, (c[f >> 2] | 0) >>> 5 | 0, 0) | 0;
                                c[p >> 2] = o;
                                c[p + 4 >> 2] = F;
                                i = g;
                                return
                            } else {
                                p = b + 216 | 0;
                                o = p;
                                o = ne(c[o >> 2] | 0, c[o + 4 >> 2] | 0, -1, -1) | 0;
                                c[p >> 2] = o;
                                c[p + 4 >> 2] = F;
                                p = b + 232 | 0;
                                o = p;
                                o = je(c[o >> 2] | 0, c[o + 4 >> 2] | 0, (c[f >> 2] | 0) >>> 5 | 0, 0) | 0;
                                c[p >> 2] = o;
                                c[p + 4 >> 2] = F;
                                i = g;
                                return
                            }
                        }

                        function Pb(b, e) {
                            b = b | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0;
                            h = i;
                            g = b + 544 | 0;
                            m = c[g >> 2] | 0;
                            f = m + (e << 2) | 0;
                            Ob(b, e, 0);
                            m = c[m + (e + 1 << 2) >> 2] | 0;
                            j = m >> 1;
                            m = (d[(c[b + 332 >> 2] | 0) + j >> 0] | 0) ^ m & 1;
                            o = a[528] | 0;
                            n = o & 255;
                            if ((((m & 255) << 24 >> 24 == o << 24 >> 24 & (n >>> 1 ^ 1) | n & 2 & m | 0) != 0 ? (k = (c[b + 396 >> 2] | 0) + (j << 3) | 0, l = c[k >> 2] | 0, (l | 0) != -1) : 0) ? ((c[g >> 2] | 0) + (l << 2) | 0) == (f | 0) : 0) c[k >> 2] = -1;
                            c[f >> 2] = c[f >> 2] & -4 | 1;
                            n = c[(c[g >> 2] | 0) + (e << 2) >> 2] | 0;
                            o = b + 556 | 0;
                            c[o >> 2] = ((((n >>> 3 & 1) + (n >>> 5) << 2) + 4 | 0) >>> 2) + (c[o >> 2] | 0);
                            i = h;
                            return
                        }

                        function Qb(b, e) {
                            b = b | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            f = i;
                            g = c[e >> 2] | 0;
                            if (g >>> 0 <= 31) {
                                l = 0;
                                i = f;
                                return l | 0
                            }
                            h = c[b + 332 >> 2] | 0;
                            j = a[528] | 0;
                            k = j & 255;
                            l = k & 2;
                            k = k >>> 1 ^ 1;
                            b = 0;
                            while (1) {
                                m = c[e + (b << 2) + 4 >> 2] | 0;
                                m = (d[h + (m >> 1) >> 0] | 0) ^ m & 1;
                                b = b + 1 | 0;
                                if ((m & 255) << 24 >> 24 == j << 24 >> 24 & k | l & m) {
                                    g = 1;
                                    e = 5;
                                    break
                                }
                                if ((b | 0) >= (g >>> 5 | 0)) {
                                    g = 0;
                                    e = 5;
                                    break
                                }
                            }
                            if ((e | 0) == 5) { i = f; return g | 0 }
                            return 0
                        }

                        function Rb(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0;
                            g = i;
                            e = b + 296 | 0;
                            if ((c[e >> 2] | 0) <= (d | 0)) { i = g; return }
                            f = b + 284 | 0;
                            s = c[f >> 2] | 0;
                            j = b + 292 | 0;
                            t = c[j >> 2] | 0;
                            u = c[t + (d << 2) >> 2] | 0;
                            if ((s | 0) > (u | 0)) {
                                r = b + 280 | 0;
                                m = b + 332 | 0;
                                l = b + 88 | 0;
                                k = b + 348 | 0;
                                n = b + 460 | 0;
                                p = b + 476 | 0;
                                q = b + 472 | 0;
                                o = b + 380 | 0;
                                do {
                                    s = s + -1 | 0;
                                    u = c[(c[r >> 2] | 0) + (s << 2) >> 2] >> 1;
                                    a[(c[m >> 2] | 0) + u >> 0] = a[544] | 0;
                                    t = c[l >> 2] | 0;
                                    if ((t | 0) <= 1) { if ((t | 0) == 1 ? (s | 0) > (c[(c[j >> 2] | 0) + ((c[e >> 2] | 0) + -1 << 2) >> 2] | 0) : 0) h = 7 } else h = 7;
                                    if ((h | 0) == 7) {
                                        h = 0;
                                        a[(c[k >> 2] | 0) + u >> 0] = c[(c[r >> 2] | 0) + (s << 2) >> 2] & 1
                                    }
                                    if (!((c[p >> 2] | 0) > (u | 0) ? (c[(c[q >> 2] | 0) + (u << 2) >> 2] | 0) > -1 : 0)) h = 11;
                                    if ((h | 0) == 11 ? (h = 0, (a[(c[o >> 2] | 0) + u >> 0] | 0) != 0) : 0) lc(n, u);
                                    t = c[j >> 2] | 0;
                                    u = c[t + (d << 2) >> 2] | 0
                                } while ((s | 0) > (u | 0));
                                s = c[f >> 2] | 0
                            }
                            c[b + 512 >> 2] = u;
                            b = c[t + (d << 2) >> 2] | 0;
                            if ((s - b | 0) > 0) c[f >> 2] = b;
                            if (((c[e >> 2] | 0) - d | 0) <= 0) { i = g; return }
                            c[e >> 2] = d;
                            i = g;
                            return
                        }

                        function Sb(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0.0,
                                r = 0;
                            d = i;
                            f = b + 72 | 0;
                            q = +h[f >> 3] * 1389796.0;
                            q = q - +(~~(q / 2147483647.0) | 0) * 2147483647.0;
                            h[f >> 3] = q;
                            l = b + 464 | 0;
                            if (q / 2147483647.0 < +h[b + 64 >> 3] ? (m = c[l >> 2] | 0, (m | 0) != 0) : 0) {
                                q = q * 1389796.0;
                                q = q - +(~~(q / 2147483647.0) | 0) * 2147483647.0;
                                h[f >> 3] = q;
                                m = c[(c[b + 460 >> 2] | 0) + (~~(+(m | 0) * (q / 2147483647.0)) << 2) >> 2] | 0;
                                o = a[(c[b + 332 >> 2] | 0) + m >> 0] | 0;
                                n = a[544] | 0;
                                p = n & 255;
                                if (((p >>> 1 ^ 1) & o << 24 >> 24 == n << 24 >> 24 | o & 2 & p | 0) != 0 ? (a[(c[b + 380 >> 2] | 0) + m >> 0] | 0) != 0 : 0) {
                                    p = b + 176 | 0;
                                    o = p;
                                    o = ne(c[o >> 2] | 0, c[o + 4 >> 2] | 0, 1, 0) | 0;
                                    c[p >> 2] = o;
                                    c[p + 4 >> 2] = F
                                }
                            } else m = -1;
                            n = b + 460 | 0;
                            p = b + 332 | 0;
                            o = b + 380 | 0;
                            while (1) {
                                if (((m | 0) != -1 ? (r = a[(c[p >> 2] | 0) + m >> 0] | 0, j = a[544] | 0, e = j & 255, g = e >>> 1 ^ 1, (g & r << 24 >> 24 == j << 24 >> 24 | r & 2 & e | 0) != 0) : 0) ? (a[(c[o >> 2] | 0) + m >> 0] | 0) != 0 : 0) break;
                                if (!(c[l >> 2] | 0)) {
                                    e = -2;
                                    k = 17;
                                    break
                                }
                                m = rc(n) | 0
                            }
                            if ((k | 0) == 17) { i = d; return e | 0 }
                            l = a[(c[b + 364 >> 2] | 0) + m >> 0] | 0;
                            k = l & 255;
                            if (!(g & l << 24 >> 24 == j << 24 >> 24 | e & 2 & k)) {
                                p = a[528] | 0;
                                r = p & 255;
                                r = ((r >>> 1 ^ 1) & l << 24 >> 24 == p << 24 >> 24 | k & 2 & r | 0) != 0 | m << 1;
                                i = d;
                                return r | 0
                            }
                            if (!(a[b + 92 >> 0] | 0)) {
                                r = (a[(c[b + 348 >> 2] | 0) + m >> 0] | 0) != 0 | m << 1;
                                i = d;
                                return r | 0
                            } else {
                                q = +h[f >> 3] * 1389796.0;
                                q = q - +(~~(q / 2147483647.0) | 0) * 2147483647.0;
                                h[f >> 3] = q;
                                r = q / 2147483647.0 < .5 | m << 1;
                                i = d;
                                return r | 0
                            }
                            return 0
                        }

                        function Tb(b, d, e, f) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            var j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0.0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0,
                                A = 0,
                                B = 0,
                                C = 0,
                                D = 0,
                                E = 0,
                                G = 0,
                                H = 0,
                                I = 0,
                                J = 0,
                                K = 0,
                                L = 0,
                                M = 0,
                                N = 0,
                                O = 0,
                                P = 0,
                                Q = 0,
                                R = 0,
                                S = 0,
                                T = 0.0,
                                U = 0;
                            j = i;
                            i = i + 16 | 0;
                            p = j + 8 | 0;
                            t = j + 4 | 0;
                            n = j;
                            m = e + 4 | 0;
                            k = c[m >> 2] | 0;
                            l = e + 8 | 0;
                            if ((k | 0) == (c[l >> 2] | 0)) {
                                q = (k >> 1) + 2 & -2;
                                q = (q | 0) < 2 ? 2 : q;
                                if ((q | 0) > (2147483647 - k | 0)) {
                                    S = va(1) | 0;
                                    Ta(S | 0, 48, 0)
                                }
                                R = c[e >> 2] | 0;
                                S = q + k | 0;
                                c[l >> 2] = S;
                                S = Ud(R, S << 2) | 0;
                                c[e >> 2] = S;
                                if ((S | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    S = va(1) | 0;
                                    Ta(S | 0, 48, 0)
                                }
                                k = c[m >> 2] | 0
                            }
                            l = (c[e >> 2] | 0) + (k << 2) | 0;
                            if (l) {
                                c[l >> 2] = 0;
                                k = c[m >> 2] | 0
                            }
                            c[m >> 2] = k + 1;
                            q = b + 544 | 0;
                            H = b + 280 | 0;
                            k = b + 588 | 0;
                            l = b + 396 | 0;
                            C = b + 504 | 0;
                            E = b + 316 | 0;
                            D = b + 540 | 0;
                            B = b + 476 | 0;
                            A = b + 472 | 0;
                            z = b + 460 | 0;
                            y = b + 488 | 0;
                            x = b + 296 | 0;
                            v = b + 496 | 0;
                            w = b + 272 | 0;
                            G = b + 268 | 0;
                            J = -2;
                            I = (c[b + 284 >> 2] | 0) + -1 | 0;
                            K = 0;
                            do {
                                L = c[q >> 2] | 0;
                                d = L + (d << 2) | 0;
                                M = c[d >> 2] | 0;
                                if ((M & 4 | 0) != 0 ? (r = +h[v >> 3], S = d + (M >>> 5 << 2) + 4 | 0, T = r + +g[S >> 2], g[S >> 2] = T, T > 1.0e20) : 0) {
                                    O = c[w >> 2] | 0;
                                    if ((O | 0) > 0) {
                                        N = c[G >> 2] | 0;
                                        M = 0;
                                        do {
                                            S = L + (c[N + (M << 2) >> 2] << 2) | 0;
                                            S = S + ((c[S >> 2] | 0) >>> 5 << 2) + 4 | 0;
                                            g[S >> 2] = +g[S >> 2] * 1.0e-20;
                                            M = M + 1 | 0
                                        } while ((M | 0) != (O | 0))
                                    }
                                    h[v >> 3] = r * 1.0e-20
                                }
                                J = (J | 0) != -2 & 1;
                                if (J >>> 0 < (c[d >> 2] | 0) >>> 5 >>> 0)
                                    do {
                                        M = c[d + (J << 2) + 4 >> 2] | 0;
                                        c[t >> 2] = M;
                                        M = M >> 1;
                                        L = (c[k >> 2] | 0) + M | 0;
                                        do {
                                            if ((a[L >> 0] | 0) == 0 ? (c[(c[l >> 2] | 0) + (M << 3) + 4 >> 2] | 0) > 0 : 0) {
                                                O = c[E >> 2] | 0;
                                                S = O + (M << 3) | 0;
                                                T = +h[C >> 3] + +h[S >> 3];
                                                h[S >> 3] = T;
                                                if (T > 1.0e+100) {
                                                    P = c[D >> 2] | 0;
                                                    if ((P | 0) > 0) {
                                                        N = 0;
                                                        do {
                                                            S = O + (N << 3) | 0;
                                                            h[S >> 3] = +h[S >> 3] * 1.0e-100;
                                                            N = N + 1 | 0
                                                        } while ((N | 0) != (P | 0))
                                                    }
                                                    h[C >> 3] = +h[C >> 3] * 1.0e-100
                                                }
                                                if ((c[B >> 2] | 0) > (M | 0) ? (u = c[A >> 2] | 0, s = c[u + (M << 2) >> 2] | 0, (s | 0) > -1) : 0) {
                                                    N = c[z >> 2] | 0;
                                                    O = c[N + (s << 2) >> 2] | 0;
                                                    a: do {
                                                        if (!s) R = 0;
                                                        else {
                                                            S = s;
                                                            while (1) {
                                                                R = S;
                                                                S = S + -1 >> 1;
                                                                Q = N + (S << 2) | 0;
                                                                P = c[Q >> 2] | 0;
                                                                U = c[c[y >> 2] >> 2] | 0;
                                                                if (!(+h[U + (O << 3) >> 3] > +h[U + (P << 3) >> 3])) break a;
                                                                c[N + (R << 2) >> 2] = P;
                                                                c[u + (c[Q >> 2] << 2) >> 2] = R;
                                                                if (!S) { R = 0; break }
                                                            }
                                                        }
                                                    } while (0);
                                                    c[N + (R << 2) >> 2] = O;
                                                    c[u + (O << 2) >> 2] = R
                                                }
                                                a[L >> 0] = 1;
                                                if ((c[(c[l >> 2] | 0) + (M << 3) + 4 >> 2] | 0) < (c[x >> 2] | 0)) { mc(e, t); break } else { K = K + 1 | 0; break }
                                            }
                                        } while (0);
                                        J = J + 1 | 0
                                    } while ((J | 0) < ((c[d >> 2] | 0) >>> 5 | 0));
                                d = c[H >> 2] | 0;
                                L = c[k >> 2] | 0;
                                do {
                                    J = I;
                                    I = I + -1 | 0;
                                    J = c[d + (J << 2) >> 2] | 0;
                                    N = J >> 1;
                                    M = L + N | 0
                                } while ((a[M >> 0] | 0) == 0);
                                d = c[(c[l >> 2] | 0) + (N << 3) >> 2] | 0;
                                a[M >> 0] = 0;
                                K = K + -1 | 0
                            } while ((K | 0) > 0);
                            c[c[e >> 2] >> 2] = J ^ 1;
                            t = b + 616 | 0;
                            v = c[t >> 2] | 0;
                            s = b + 620 | 0;
                            if (!v) w = c[s >> 2] | 0;
                            else {
                                c[s >> 2] = 0;
                                w = 0
                            }
                            u = c[m >> 2] | 0;
                            if ((w | 0) < (u | 0)) {
                                y = b + 624 | 0;
                                x = c[y >> 2] | 0;
                                if ((x | 0) < (u | 0)) {
                                    U = u + 1 - x & -2;
                                    w = (x >> 1) + 2 & -2;
                                    w = (U | 0) > (w | 0) ? U : w;
                                    if ((w | 0) > (2147483647 - x | 0)) {
                                        U = va(1) | 0;
                                        Ta(U | 0, 48, 0)
                                    }
                                    U = w + x | 0;
                                    c[y >> 2] = U;
                                    v = Ud(v, U << 2) | 0;
                                    c[t >> 2] = v;
                                    if ((v | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        U = va(1) | 0;
                                        Ta(U | 0, 48, 0)
                                    }
                                }
                                w = c[s >> 2] | 0;
                                b: do {
                                    if ((w | 0) < (u | 0))
                                        while (1) {
                                            v = v + (w << 2) | 0;
                                            if (v) c[v >> 2] = 0;
                                            w = w + 1 | 0;
                                            if ((w | 0) == (u | 0)) break b;
                                            v = c[t >> 2] | 0
                                        }
                                } while (0);
                                c[s >> 2] = u;
                                u = c[m >> 2] | 0
                            }
                            if ((u | 0) > 0) {
                                w = c[t >> 2] | 0;
                                v = c[e >> 2] | 0;
                                x = 0;
                                do {
                                    c[w + (x << 2) >> 2] = c[v + (x << 2) >> 2];
                                    x = x + 1 | 0;
                                    u = c[m >> 2] | 0
                                } while ((x | 0) < (u | 0))
                            }
                            v = c[b + 84 >> 2] | 0;
                            if ((v | 0) == 1)
                                if ((u | 0) > 1) {
                                    n = c[e >> 2] | 0;
                                    o = 1;
                                    v = 1;
                                    while (1) {
                                        u = c[n + (o << 2) >> 2] | 0;
                                        p = c[l >> 2] | 0;
                                        w = c[p + (u >> 1 << 3) >> 2] | 0;
                                        c: do {
                                            if ((w | 0) != -1) {
                                                x = (c[q >> 2] | 0) + (w << 2) | 0;
                                                y = c[x >> 2] | 0;
                                                if (y >>> 0 > 63) {
                                                    w = c[k >> 2] | 0;
                                                    z = 1;
                                                    while (1) {
                                                        U = c[x + (z << 2) + 4 >> 2] >> 1;
                                                        if ((a[w + U >> 0] | 0) == 0 ? (c[p + (U << 3) + 4 >> 2] | 0) > 0 : 0) break;
                                                        z = z + 1 | 0;
                                                        if ((z | 0) >= (y >>> 5 | 0)) break c
                                                    }
                                                    c[n + (v << 2) >> 2] = u;
                                                    v = v + 1 | 0
                                                }
                                            } else {
                                                c[n + (v << 2) >> 2] = u;
                                                v = v + 1 | 0
                                            }
                                        } while (0);
                                        o = o + 1 | 0;
                                        p = c[m >> 2] | 0;
                                        if ((o | 0) >= (p | 0)) { n = p; break }
                                    }
                                } else {
                                    n = u;
                                    o = 1;
                                    v = 1
                                }
                            else if ((v | 0) == 2)
                                if ((u | 0) > 1) {
                                    q = 1;
                                    v = 1;
                                    do {
                                        w = c[e >> 2] | 0;
                                        u = c[w + (q << 2) >> 2] | 0;
                                        if ((c[(c[l >> 2] | 0) + (u >> 1 << 3) >> 2] | 0) != -1) {
                                            c[n >> 2] = u;
                                            c[p + 0 >> 2] = c[n + 0 >> 2];
                                            if (!(Ub(b, p) | 0)) {
                                                u = c[e >> 2] | 0;
                                                w = u;
                                                u = c[u + (q << 2) >> 2] | 0;
                                                o = 62
                                            }
                                        } else o = 62;
                                        if ((o | 0) == 62) {
                                            o = 0;
                                            c[w + (v << 2) >> 2] = u;
                                            v = v + 1 | 0
                                        }
                                        q = q + 1 | 0;
                                        u = c[m >> 2] | 0
                                    } while ((q | 0) < (u | 0));
                                    n = u;
                                    o = q
                                } else {
                                    n = u;
                                    o = 1;
                                    v = 1
                                }
                            else {
                                n = u;
                                o = u;
                                v = u
                            }
                            U = b + 240 | 0;
                            S = U;
                            S = ne(c[S >> 2] | 0, c[S + 4 >> 2] | 0, n | 0, ((n | 0) < 0) << 31 >> 31 | 0) | 0;
                            c[U >> 2] = S;
                            c[U + 4 >> 2] = F;
                            o = o - v | 0;
                            if ((o | 0) > 0) {
                                n = n - o | 0;
                                c[m >> 2] = n
                            }
                            U = b + 248 | 0;
                            S = U;
                            S = ne(c[S >> 2] | 0, c[S + 4 >> 2] | 0, n | 0, ((n | 0) < 0) << 31 >> 31 | 0) | 0;
                            c[U >> 2] = S;
                            c[U + 4 >> 2] = F;
                            if ((n | 0) == 1) e = 0;
                            else {
                                e = c[e >> 2] | 0;
                                if ((n | 0) > 2) {
                                    b = c[l >> 2] | 0;
                                    m = 2;
                                    o = 1;
                                    do {
                                        o = (c[b + (c[e + (m << 2) >> 2] >> 1 << 3) + 4 >> 2] | 0) > (c[b + (c[e + (o << 2) >> 2] >> 1 << 3) + 4 >> 2] | 0) ? m : o;
                                        m = m + 1 | 0
                                    } while ((m | 0) < (n | 0))
                                } else o = 1;
                                S = e + (o << 2) | 0;
                                U = c[S >> 2] | 0;
                                e = e + 4 | 0;
                                c[S >> 2] = c[e >> 2];
                                c[e >> 2] = U;
                                e = c[(c[l >> 2] | 0) + (U >> 1 << 3) + 4 >> 2] | 0
                            }
                            c[f >> 2] = e;
                            if ((c[s >> 2] | 0) > 0) f = 0;
                            else { i = j; return }
                            do {
                                a[(c[k >> 2] | 0) + (c[(c[t >> 2] | 0) + (f << 2) >> 2] >> 1) >> 0] = 0;
                                f = f + 1 | 0
                            } while ((f | 0) < (c[s >> 2] | 0));
                            i = j;
                            return
                        }

                        function Ub(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0;
                            e = i;
                            n = c[d >> 2] | 0;
                            l = b + 396 | 0;
                            q = c[l >> 2] | 0;
                            k = b + 544 | 0;
                            s = (c[k >> 2] | 0) + (c[q + (n >> 1 << 3) >> 2] << 2) | 0;
                            h = b + 604 | 0;
                            f = b + 608 | 0;
                            if (c[h >> 2] | 0) c[f >> 2] = 0;
                            g = b + 588 | 0;
                            j = b + 612 | 0;
                            b = b + 616 | 0;
                            o = 1;
                            while (1) {
                                if (o >>> 0 < (c[s >> 2] | 0) >>> 5 >>> 0) {
                                    r = c[s + (o << 2) + 4 >> 2] | 0;
                                    p = r >> 1;
                                    if ((c[q + (p << 3) + 4 >> 2] | 0) != 0 ? (m = a[(c[g >> 2] | 0) + p >> 0] | 0, (m + -1 << 24 >> 24 & 255) >= 2) : 0) {
                                        s = c[f >> 2] | 0;
                                        t = (s | 0) == (c[j >> 2] | 0);
                                        if (m << 24 >> 24 == 3 ? 1 : (c[q + (p << 3) >> 2] | 0) == -1) { k = 8; break }
                                        if (t) {
                                            q = (s >> 1) + 2 & -2;
                                            q = (q | 0) < 2 ? 2 : q;
                                            if ((q | 0) > (2147483647 - s | 0)) { k = 24; break }
                                            u = c[h >> 2] | 0;
                                            t = q + s | 0;
                                            c[j >> 2] = t;
                                            t = Ud(u, t << 3) | 0;
                                            c[h >> 2] = t;
                                            if ((t | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) { k = 24; break }
                                            s = c[f >> 2] | 0
                                        }
                                        c[f >> 2] = s + 1;
                                        q = (c[h >> 2] | 0) + (s << 3) | 0;
                                        if (q) {
                                            u = q;
                                            c[u >> 2] = o;
                                            c[u + 4 >> 2] = n
                                        }
                                        c[d >> 2] = r;
                                        s = c[l >> 2] | 0;
                                        n = r;
                                        q = s;
                                        s = (c[k >> 2] | 0) + (c[s + (p << 3) >> 2] << 2) | 0;
                                        o = 0
                                    }
                                } else {
                                    n = (c[g >> 2] | 0) + (n >> 1) | 0;
                                    if (!(a[n >> 0] | 0)) {
                                        a[n >> 0] = 2;
                                        mc(b, d)
                                    }
                                    n = c[f >> 2] | 0;
                                    if (!n) {
                                        f = 1;
                                        k = 34;
                                        break
                                    }
                                    u = n + -1 | 0;
                                    n = c[h >> 2] | 0;
                                    o = c[n + (u << 3) >> 2] | 0;
                                    n = c[n + (u << 3) + 4 >> 2] | 0;
                                    c[d >> 2] = n;
                                    q = c[l >> 2] | 0;
                                    s = (c[k >> 2] | 0) + (c[q + (n >> 1 << 3) >> 2] << 2) | 0;
                                    c[f >> 2] = u
                                }
                                o = o + 1 | 0
                            }
                            if ((k | 0) == 8) {
                                if (t) {
                                    k = (s >> 1) + 2 & -2;
                                    k = (k | 0) < 2 ? 2 : k;
                                    if ((k | 0) > (2147483647 - s | 0)) {
                                        u = va(1) | 0;
                                        Ta(u | 0, 48, 0)
                                    }
                                    t = c[h >> 2] | 0;
                                    u = k + s | 0;
                                    c[j >> 2] = u;
                                    u = Ud(t, u << 3) | 0;
                                    c[h >> 2] = u;
                                    if ((u | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        u = va(1) | 0;
                                        Ta(u | 0, 48, 0)
                                    }
                                    s = c[f >> 2] | 0
                                }
                                j = s + 1 | 0;
                                c[f >> 2] = j;
                                k = (c[h >> 2] | 0) + (s << 3) | 0;
                                if (k) {
                                    j = k;
                                    c[j >> 2] = 0;
                                    c[j + 4 >> 2] = n;
                                    j = c[f >> 2] | 0
                                }
                                if ((j | 0) > 0) k = 0;
                                else {
                                    u = 0;
                                    i = e;
                                    return u | 0
                                }
                                do {
                                    l = (c[g >> 2] | 0) + (c[(c[h >> 2] | 0) + (k << 3) + 4 >> 2] >> 1) | 0;
                                    if (!(a[l >> 0] | 0)) {
                                        a[l >> 0] = 3;
                                        mc(b, (c[h >> 2] | 0) + (k << 3) + 4 | 0);
                                        j = c[f >> 2] | 0
                                    }
                                    k = k + 1 | 0
                                } while ((k | 0) < (j | 0));
                                f = 0;
                                i = e;
                                return f | 0
                            } else if ((k | 0) == 24) Ta(va(1) | 0, 48, 0);
                            else if ((k | 0) == 34) { i = e; return f | 0 }
                            return 0
                        }

                        function Vb(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0;
                            j = i;
                            i = i + 32 | 0;
                            h = j + 16 | 0;
                            g = j + 12 | 0;
                            k = j + 8 | 0;
                            f = j;
                            n = e + 20 | 0;
                            l = e + 16 | 0;
                            if ((c[n >> 2] | 0) > 0) {
                                m = 0;
                                do {
                                    a[(c[e >> 2] | 0) + (c[(c[l >> 2] | 0) + (m << 2) >> 2] | 0) >> 0] = 0;
                                    m = m + 1 | 0
                                } while ((m | 0) < (c[n >> 2] | 0))
                            }
                            if (c[l >> 2] | 0) c[n >> 2] = 0;
                            m = c[d >> 2] | 0;
                            c[k >> 2] = m;
                            c[g >> 2] = m;
                            c[h + 0 >> 2] = c[g + 0 >> 2];
                            sc(e, h, 0);
                            l = (c[e >> 2] | 0) + m | 0;
                            if (!(a[l >> 0] | 0)) {
                                a[l >> 0] = 1;
                                mc(e + 16 | 0, k)
                            }
                            if (!(c[b + 296 >> 2] | 0)) { i = j; return }
                            d = m >> 1;
                            o = b + 588 | 0;
                            a[(c[o >> 2] | 0) + d >> 0] = 1;
                            p = c[b + 284 >> 2] | 0;
                            n = b + 292 | 0;
                            s = c[c[n >> 2] >> 2] | 0;
                            if ((p | 0) > (s | 0)) {
                                k = b + 280 | 0;
                                l = b + 396 | 0;
                                m = e + 16 | 0;
                                b = b + 544 | 0;
                                do {
                                    p = p + -1 | 0;
                                    r = c[(c[k >> 2] | 0) + (p << 2) >> 2] | 0;
                                    q = r >> 1;
                                    if (a[(c[o >> 2] | 0) + q >> 0] | 0) {
                                        s = c[l >> 2] | 0;
                                        t = c[s + (q << 3) >> 2] | 0;
                                        a: do {
                                            if ((t | 0) == -1) {
                                                r = r ^ 1;
                                                c[f >> 2] = r;
                                                c[g >> 2] = r;
                                                c[h + 0 >> 2] = c[g + 0 >> 2];
                                                sc(e, h, 0);
                                                r = (c[e >> 2] | 0) + r | 0;
                                                if (!(a[r >> 0] | 0)) {
                                                    a[r >> 0] = 1;
                                                    mc(m, f)
                                                }
                                            } else {
                                                r = (c[b >> 2] | 0) + (t << 2) | 0;
                                                t = c[r >> 2] | 0;
                                                if (t >>> 0 > 63) {
                                                    u = 1;
                                                    while (1) {
                                                        v = c[r + (u << 2) + 4 >> 2] >> 1;
                                                        if ((c[s + (v << 3) + 4 >> 2] | 0) > 0) {
                                                            a[(c[o >> 2] | 0) + v >> 0] = 1;
                                                            t = c[r >> 2] | 0
                                                        }
                                                        u = u + 1 | 0;
                                                        if ((u | 0) >= (t >>> 5 | 0)) break a;
                                                        s = c[l >> 2] | 0
                                                    }
                                                }
                                            }
                                        } while (0);
                                        a[(c[o >> 2] | 0) + q >> 0] = 0;
                                        s = c[c[n >> 2] >> 2] | 0
                                    }
                                } while ((p | 0) > (s | 0))
                            }
                            a[(c[o >> 2] | 0) + d >> 0] = 0;
                            i = j;
                            return
                        }

                        function Wb(b) {
                            b = b | 0;
                            var e = 0,
                                f = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0.0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0;
                            f = i;
                            i = i + 16 | 0;
                            p = f + 4 | 0;
                            u = f;
                            e = b + 272 | 0;
                            w = c[e >> 2] | 0;
                            n = +h[b + 496 >> 3] / +(w | 0);
                            k = b + 544 | 0;
                            l = b + 268 | 0;
                            v = c[l >> 2] | 0;
                            c[u >> 2] = k;
                            c[p + 0 >> 2] = c[u + 0 >> 2];
                            tc(v, w, p);
                            p = c[e >> 2] | 0;
                            if ((p | 0) > 0) {
                                m = b + 332 | 0;
                                o = b + 396 | 0;
                                q = 0;
                                v = 0;
                                do {
                                    t = c[l >> 2] | 0;
                                    u = c[t + (q << 2) >> 2] | 0;
                                    w = c[k >> 2] | 0;
                                    r = w + (u << 2) | 0;
                                    s = c[r >> 2] | 0;
                                    do {
                                        if (s >>> 0 > 95) {
                                            x = c[w + (u + 1 << 2) >> 2] | 0;
                                            w = x >> 1;
                                            x = (d[(c[m >> 2] | 0) + w >> 0] | 0) ^ x & 1;
                                            z = a[528] | 0;
                                            y = z & 255;
                                            if (((x & 255) << 24 >> 24 == z << 24 >> 24 & (y >>> 1 ^ 1) | y & 2 & x | 0) != 0 ? (z = c[(c[o >> 2] | 0) + (w << 3) >> 2] | 0, (z | 0) != -1 & (z | 0) == (u | 0)) : 0) { j = 9; break }
                                            if ((q | 0) >= ((p | 0) / 2 | 0 | 0) ? !(+g[r + (s >>> 5 << 2) + 4 >> 2] < n) : 0) { j = 9; break }
                                            Pb(b, u)
                                        } else j = 9
                                    } while (0);
                                    if ((j | 0) == 9) {
                                        j = 0;
                                        c[t + (v << 2) >> 2] = u;
                                        v = v + 1 | 0
                                    }
                                    q = q + 1 | 0;
                                    p = c[e >> 2] | 0
                                } while ((q | 0) < (p | 0))
                            } else {
                                q = 0;
                                v = 0
                            }
                            j = q - v | 0;
                            if ((j | 0) > 0) c[e >> 2] = p - j;
                            if (!(+((c[b + 556 >> 2] | 0) >>> 0) > +h[b + 96 >> 3] * +((c[b + 548 >> 2] | 0) >>> 0))) { i = f; return }
                            gb[c[(c[b >> 2] | 0) + 8 >> 2] & 31](b);
                            i = f;
                            return
                        }

                        function Xb(b, e) {
                            b = b | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0;
                            f = i;
                            g = e + 4 | 0;
                            m = c[g >> 2] | 0;
                            if ((m | 0) > 0) {
                                j = b + 544 | 0;
                                h = b + 332 | 0;
                                k = 0;
                                l = 0;
                                do {
                                    u = c[e >> 2] | 0;
                                    p = c[u + (k << 2) >> 2] | 0;
                                    m = (c[j >> 2] | 0) + (p << 2) | 0;
                                    o = c[m >> 2] | 0;
                                    do {
                                        if (o >>> 0 > 31) {
                                            v = c[h >> 2] | 0;
                                            r = a[528] | 0;
                                            q = r & 255;
                                            w = q & 2;
                                            q = q >>> 1 ^ 1;
                                            s = o >>> 5;
                                            t = 0;
                                            do {
                                                x = c[m + (t << 2) + 4 >> 2] | 0;
                                                x = (d[v + (x >> 1) >> 0] | 0) ^ x & 1;
                                                t = t + 1 | 0;
                                                if ((x & 255) << 24 >> 24 == r << 24 >> 24 & q | w & x) { n = 7; break }
                                            } while ((t | 0) < (s | 0));
                                            if ((n | 0) == 7) {
                                                n = 0;
                                                Pb(b, p);
                                                break
                                            }
                                            if (o >>> 0 > 95) {
                                                n = a[536] | 0;
                                                q = o >>> 5;
                                                p = 2;
                                                do {
                                                    r = m + (p << 2) + 4 | 0;
                                                    x = c[r >> 2] | 0;
                                                    x = (d[(c[h >> 2] | 0) + (x >> 1) >> 0] | 0) ^ x & 1;
                                                    w = n & 255;
                                                    if ((x & 255) << 24 >> 24 == n << 24 >> 24 & (w >>> 1 ^ 1) | w & 2 & x) {
                                                        c[r >> 2] = c[m + (q + -1 << 2) + 4 >> 2];
                                                        o = c[m >> 2] | 0;
                                                        if (o & 8) {
                                                            o = o >>> 5;
                                                            c[m + (o + -1 << 2) + 4 >> 2] = c[m + (o << 2) + 4 >> 2];
                                                            o = c[m >> 2] | 0
                                                        }
                                                        o = o + -32 | 0;
                                                        c[m >> 2] = o;
                                                        p = p + -1 | 0
                                                    }
                                                    p = p + 1 | 0;
                                                    q = o >>> 5
                                                } while ((p | 0) < (q | 0));
                                                p = c[e >> 2] | 0;
                                                u = p;
                                                p = c[p + (k << 2) >> 2] | 0;
                                                n = 16
                                            } else n = 16
                                        } else n = 16
                                    } while (0);
                                    if ((n | 0) == 16) {
                                        n = 0;
                                        c[u + (l << 2) >> 2] = p;
                                        l = l + 1 | 0
                                    }
                                    k = k + 1 | 0;
                                    m = c[g >> 2] | 0
                                } while ((k | 0) < (m | 0))
                            } else {
                                k = 0;
                                l = 0
                            }
                            e = k - l | 0;
                            if ((e | 0) <= 0) { i = f; return }
                            c[g >> 2] = m - e;
                            i = f;
                            return
                        }

                        function Yb(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0;
                            g = i;
                            i = i + 16 | 0;
                            e = g + 4 | 0;
                            h = g;
                            c[e >> 2] = 0;
                            d = e + 4 | 0;
                            c[d >> 2] = 0;
                            f = e + 8 | 0;
                            c[f >> 2] = 0;
                            c[h >> 2] = 0;
                            j = b + 540 | 0;
                            n = c[j >> 2] | 0;
                            if ((n | 0) > 0) {
                                l = b + 380 | 0;
                                k = b + 332 | 0;
                                m = 0;
                                do {
                                    if ((a[(c[l >> 2] | 0) + m >> 0] | 0) != 0 ? (p = a[(c[k >> 2] | 0) + m >> 0] | 0, q = a[544] | 0, o = q & 255, ((o >>> 1 ^ 1) & p << 24 >> 24 == q << 24 >> 24 | p & 2 & o | 0) != 0) : 0) {
                                        nc(e, h);
                                        n = c[j >> 2] | 0
                                    }
                                    m = m + 1 | 0;
                                    c[h >> 2] = m
                                } while ((m | 0) < (n | 0))
                            }
                            uc(b + 460 | 0, e);
                            b = c[e >> 2] | 0;
                            if (!b) { i = g; return }
                            c[d >> 2] = 0;
                            Td(b);
                            c[e >> 2] = 0;
                            c[f >> 2] = 0;
                            i = g;
                            return
                        }

                        function Zb(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0;
                            d = i;
                            f = b + 492 | 0;
                            if ((a[f >> 0] | 0) != 0 ? (Mb(b) | 0) == -1 : 0) {
                                f = b + 284 | 0;
                                g = b + 516 | 0;
                                if ((c[f >> 2] | 0) == (c[g >> 2] | 0)) {
                                    s = 1;
                                    i = d;
                                    return s | 0
                                }
                                j = b + 520 | 0;
                                s = j;
                                r = c[s + 4 >> 2] | 0;
                                if ((r | 0) > 0 | (r | 0) == 0 & (c[s >> 2] | 0) >>> 0 > 0) {
                                    s = 1;
                                    i = d;
                                    return s | 0
                                }
                                Xb(b, b + 268 | 0);
                                if (a[b + 536 >> 0] | 0) {
                                    Xb(b, b + 256 | 0);
                                    l = b + 564 | 0;
                                    k = b + 568 | 0;
                                    if ((c[k >> 2] | 0) > 0) {
                                        n = b + 588 | 0;
                                        m = 0;
                                        do {
                                            a[(c[n >> 2] | 0) + (c[(c[l >> 2] | 0) + (m << 2) >> 2] | 0) >> 0] = 1;
                                            m = m + 1 | 0
                                        } while ((m | 0) < (c[k >> 2] | 0))
                                    }
                                    p = c[f >> 2] | 0;
                                    if ((p | 0) > 0) {
                                        m = c[b + 280 >> 2] | 0;
                                        n = c[b + 588 >> 2] | 0;
                                        q = 0;
                                        o = 0;
                                        do {
                                            r = c[m + (q << 2) >> 2] | 0;
                                            if (!(a[n + (r >> 1) >> 0] | 0)) {
                                                c[m + (o << 2) >> 2] = r;
                                                p = c[f >> 2] | 0;
                                                o = o + 1 | 0
                                            }
                                            q = q + 1 | 0
                                        } while ((q | 0) < (p | 0))
                                    } else {
                                        q = 0;
                                        o = 0
                                    }
                                    m = q - o | 0;
                                    if ((m | 0) > 0) {
                                        p = p - m | 0;
                                        c[f >> 2] = p
                                    }
                                    c[b + 512 >> 2] = p;
                                    a: do {
                                        if ((c[k >> 2] | 0) > 0) {
                                            o = b + 588 | 0;
                                            m = 0;
                                            do {
                                                a[(c[o >> 2] | 0) + (c[(c[l >> 2] | 0) + (m << 2) >> 2] | 0) >> 0] = 0;
                                                m = m + 1 | 0;
                                                n = c[k >> 2] | 0
                                            } while ((m | 0) < (n | 0));
                                            if ((n | 0) > 0) {
                                                n = b + 580 | 0;
                                                o = b + 584 | 0;
                                                m = b + 576 | 0;
                                                p = 0;
                                                while (1) {
                                                    r = c[n >> 2] | 0;
                                                    if ((r | 0) == (c[o >> 2] | 0)) {
                                                        q = (r >> 1) + 2 & -2;
                                                        q = (q | 0) < 2 ? 2 : q;
                                                        if ((q | 0) > (2147483647 - r | 0)) { e = 28; break }
                                                        s = c[m >> 2] | 0;
                                                        q = q + r | 0;
                                                        c[o >> 2] = q;
                                                        q = Ud(s, q << 2) | 0;
                                                        c[m >> 2] = q;
                                                        if ((q | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) { e = 28; break }
                                                        r = c[n >> 2] | 0
                                                    } else q = c[m >> 2] | 0;
                                                    s = q + (r << 2) | 0;
                                                    if (s) {
                                                        c[s >> 2] = 0;
                                                        r = c[n >> 2] | 0
                                                    }
                                                    c[n >> 2] = r + 1;
                                                    s = c[l >> 2] | 0;
                                                    c[q + (r << 2) >> 2] = c[s + (p << 2) >> 2];
                                                    p = p + 1 | 0;
                                                    if ((p | 0) >= (c[k >> 2] | 0)) break a
                                                }
                                                if ((e | 0) == 28) Ta(va(1) | 0, 48, 0)
                                            } else e = 21
                                        } else e = 21
                                    } while (0);
                                    if ((e | 0) == 21) s = c[l >> 2] | 0;
                                    if (s) c[k >> 2] = 0
                                }
                                if (+((c[b + 556 >> 2] | 0) >>> 0) > +h[b + 96 >> 3] * +((c[b + 548 >> 2] | 0) >>> 0)) gb[c[(c[b >> 2] | 0) + 8 >> 2] & 31](b);
                                Yb(b);
                                c[g >> 2] = c[f >> 2];
                                r = b + 224 | 0;
                                s = b + 232 | 0;
                                r = ne(c[s >> 2] | 0, c[s + 4 >> 2] | 0, c[r >> 2] | 0, c[r + 4 >> 2] | 0) | 0;
                                s = j;
                                c[s >> 2] = r;
                                c[s + 4 >> 2] = F;
                                s = 1;
                                i = d;
                                return s | 0
                            }
                            a[f >> 0] = 0;
                            s = 0;
                            i = d;
                            return s | 0
                        }

                        function _b(b, e, f) {
                            b = b | 0;
                            e = e | 0;
                            f = f | 0;
                            var j = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0,
                                A = 0,
                                B = 0,
                                C = 0,
                                D = 0,
                                E = 0,
                                G = 0,
                                H = 0,
                                I = 0,
                                J = 0,
                                K = 0,
                                L = 0,
                                M = 0,
                                N = 0,
                                O = 0,
                                P = 0,
                                Q = 0,
                                R = 0,
                                T = 0,
                                U = 0,
                                V = 0,
                                W = 0,
                                X = 0,
                                Y = 0,
                                Z = 0,
                                _ = 0,
                                $ = 0,
                                aa = 0,
                                ba = 0,
                                ca = 0,
                                da = 0,
                                ea = 0,
                                fa = 0.0,
                                ga = 0,
                                ha = 0,
                                ia = 0,
                                ja = 0.0,
                                ka = 0,
                                la = 0,
                                ma = 0,
                                na = 0,
                                oa = 0,
                                pa = 0,
                                qa = 0.0,
                                ra = 0,
                                sa = 0,
                                ta = 0.0;
                            n = i;
                            i = i + 64 | 0;
                            _ = n;
                            G = n + 60 | 0;
                            B = n + 56 | 0;
                            j = n + 44 | 0;
                            $ = n + 40 | 0;
                            c[j >> 2] = 0;
                            m = j + 4 | 0;
                            c[m >> 2] = 0;
                            l = j + 8 | 0;
                            c[l >> 2] = 0;
                            N = e + 160 | 0;
                            M = N;
                            M = ne(c[M >> 2] | 0, c[M + 4 >> 2] | 0, 1, 0) | 0;
                            c[N >> 2] = M;
                            c[N + 4 >> 2] = F;
                            N = (f | 0) < 0;
                            M = e + 680 | 0;
                            L = e + 664 | 0;
                            K = e + 672 | 0;
                            q = e + 296 | 0;
                            w = e + 272 | 0;
                            o = e + 284 | 0;
                            I = e + 640 | 0;
                            E = e + 308 | 0;
                            D = e + 304 | 0;
                            r = e + 332 | 0;
                            H = e + 292 | 0;
                            ba = e + 168 | 0;
                            t = e + 396 | 0;
                            v = e + 280 | 0;
                            J = e + 184 | 0;
                            C = e + 192 | 0;
                            u = e + 48 | 0;
                            U = e + 504 | 0;
                            Y = e + 56 | 0;
                            aa = e + 496 | 0;
                            ca = e + 656 | 0;
                            O = e + 144 | 0;
                            P = e + 648 | 0;
                            Q = e + 128 | 0;
                            R = e + 44 | 0;
                            T = e + 200 | 0;
                            V = e + 208 | 0;
                            W = e + 224 | 0;
                            X = e + 216 | 0;
                            s = e + 232 | 0;
                            Z = e + 540 | 0;
                            p = e + 292 | 0;
                            x = e + 544 | 0;
                            z = e + 276 | 0;
                            y = e + 268 | 0;
                            A = e + 268 | 0;
                            da = 0;
                            a: while (1) {
                                ea = N | (da | 0) < (f | 0);
                                while (1) {
                                    ga = Mb(e) | 0;
                                    if ((ga | 0) != -1) break;
                                    if (!ea) { ga = 41; break a }
                                    if (a[M >> 0] | 0) { ga = 41; break a }
                                    ga = L;
                                    ha = c[ga + 4 >> 2] | 0;
                                    if ((ha | 0) >= 0 ? (sa = C, ra = c[sa + 4 >> 2] | 0, !(ra >>> 0 < ha >>> 0 | ((ra | 0) == (ha | 0) ? (c[sa >> 2] | 0) >>> 0 < (c[ga >> 2] | 0) >>> 0 : 0))) : 0) { ga = 41; break a }
                                    ga = K;
                                    ha = c[ga + 4 >> 2] | 0;
                                    if ((ha | 0) >= 0 ? (sa = J, ra = c[sa + 4 >> 2] | 0, !(ra >>> 0 < ha >>> 0 | ((ra | 0) == (ha | 0) ? (c[sa >> 2] | 0) >>> 0 < (c[ga >> 2] | 0) >>> 0 : 0))) : 0) { ga = 41; break a }
                                    if ((c[q >> 2] | 0) == 0 ? !(Zb(e) | 0) : 0) { ga = 50; break a }
                                    if (+((c[w >> 2] | 0) - (c[o >> 2] | 0) | 0) >= +h[I >> 3]) Wb(e);
                                    while (1) {
                                        ga = c[q >> 2] | 0;
                                        if ((ga | 0) >= (c[E >> 2] | 0)) { ga = 59; break }
                                        ka = c[(c[D >> 2] | 0) + (ga << 2) >> 2] | 0;
                                        ha = d[(c[r >> 2] | 0) + (ka >> 1) >> 0] | 0;
                                        sa = ha ^ ka & 1;
                                        ia = sa & 255;
                                        pa = a[528] | 0;
                                        ra = pa & 255;
                                        if (!(ia << 24 >> 24 == pa << 24 >> 24 & (ra >>> 1 ^ 1) | ra & 2 & sa)) { ga = 56; break }
                                        c[G >> 2] = c[o >> 2];
                                        nc(H, G)
                                    }
                                    if ((ga | 0) == 56) {
                                        ga = 0;
                                        ra = a[536] | 0;
                                        sa = ra & 255;
                                        if ((sa >>> 1 ^ 1) & ia << 24 >> 24 == ra << 24 >> 24 | ha & 2 & sa) { ga = 57; break a }
                                        if ((ka | 0) == -2) ga = 59
                                    }
                                    if ((ga | 0) == 59) {
                                        sa = ba;
                                        sa = ne(c[sa >> 2] | 0, c[sa + 4 >> 2] | 0, 1, 0) | 0;
                                        ka = ba;
                                        c[ka >> 2] = sa;
                                        c[ka + 4 >> 2] = F;
                                        ka = Sb(e) | 0;
                                        if ((ka | 0) == -2) { ga = 60; break a }
                                    }
                                    c[_ >> 2] = c[o >> 2];
                                    nc(H, _);
                                    sa = ka >> 1;
                                    a[(c[r >> 2] | 0) + sa >> 0] = (ka & 1 ^ 1) & 255 ^ 1;
                                    ra = c[q >> 2] | 0;
                                    sa = (c[t >> 2] | 0) + (sa << 3) | 0;
                                    c[sa >> 2] = -1;
                                    c[sa + 4 >> 2] = ra;
                                    sa = c[o >> 2] | 0;
                                    c[o >> 2] = sa + 1;
                                    c[(c[v >> 2] | 0) + (sa << 2) >> 2] = ka
                                }
                                ra = C;
                                ra = ne(c[ra >> 2] | 0, c[ra + 4 >> 2] | 0, 1, 0) | 0;
                                sa = C;
                                c[sa >> 2] = ra;
                                c[sa + 4 >> 2] = F;
                                da = da + 1 | 0;
                                if (!(c[q >> 2] | 0)) { ga = 5; break }
                                if (c[j >> 2] | 0) c[m >> 2] = 0;
                                Tb(e, ga, j, B);
                                Rb(e, c[B >> 2] | 0);
                                if ((c[m >> 2] | 0) == 1) {
                                    ra = c[c[j >> 2] >> 2] | 0;
                                    sa = ra >> 1;
                                    a[(c[r >> 2] | 0) + sa >> 0] = (ra & 1 ^ 1) & 255 ^ 1;
                                    pa = c[q >> 2] | 0;
                                    sa = (c[t >> 2] | 0) + (sa << 3) | 0;
                                    c[sa >> 2] = -1;
                                    c[sa + 4 >> 2] = pa;
                                    sa = c[o >> 2] | 0;
                                    c[o >> 2] = sa + 1;
                                    c[(c[v >> 2] | 0) + (sa << 2) >> 2] = ra
                                } else {
                                    ea = pc(x, j, 1) | 0;
                                    ga = c[w >> 2] | 0;
                                    if ((ga | 0) == (c[z >> 2] | 0)) {
                                        ha = (ga >> 1) + 2 & -2;
                                        ha = (ha | 0) < 2 ? 2 : ha;
                                        if ((ha | 0) > (2147483647 - ga | 0)) { ga = 14; break }
                                        ra = c[y >> 2] | 0;
                                        sa = ha + ga | 0;
                                        c[z >> 2] = sa;
                                        sa = Ud(ra, sa << 2) | 0;
                                        c[y >> 2] = sa;
                                        if ((sa | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) { ga = 14; break }
                                        ga = c[w >> 2] | 0
                                    }
                                    c[w >> 2] = ga + 1;
                                    ga = (c[y >> 2] | 0) + (ga << 2) | 0;
                                    if (ga) c[ga >> 2] = ea;
                                    Nb(e, ea);
                                    ia = c[x >> 2] | 0;
                                    sa = ia + (ea << 2) | 0;
                                    fa = +h[aa >> 3];
                                    sa = sa + ((c[sa >> 2] | 0) >>> 5 << 2) + 4 | 0;
                                    ta = fa + +g[sa >> 2];
                                    g[sa >> 2] = ta;
                                    if (ta > 1.0e20) {
                                        ha = c[w >> 2] | 0;
                                        if ((ha | 0) > 0) {
                                            ga = c[A >> 2] | 0;
                                            ka = 0;
                                            do {
                                                sa = ia + (c[ga + (ka << 2) >> 2] << 2) | 0;
                                                sa = sa + ((c[sa >> 2] | 0) >>> 5 << 2) + 4 | 0;
                                                g[sa >> 2] = +g[sa >> 2] * 1.0e-20;
                                                ka = ka + 1 | 0
                                            } while ((ka | 0) != (ha | 0))
                                        }
                                        h[aa >> 3] = fa * 1.0e-20
                                    }
                                    ra = c[c[j >> 2] >> 2] | 0;
                                    sa = ra >> 1;
                                    a[(c[r >> 2] | 0) + sa >> 0] = (ra & 1 ^ 1) & 255 ^ 1;
                                    pa = c[q >> 2] | 0;
                                    sa = (c[t >> 2] | 0) + (sa << 3) | 0;
                                    c[sa >> 2] = ea;
                                    c[sa + 4 >> 2] = pa;
                                    sa = c[o >> 2] | 0;
                                    c[o >> 2] = sa + 1;
                                    c[(c[v >> 2] | 0) + (sa << 2) >> 2] = ra
                                }
                                h[U >> 3] = 1.0 / +h[u >> 3] * +h[U >> 3];
                                h[aa >> 3] = 1.0 / +h[Y >> 3] * +h[aa >> 3];
                                sa = (c[ca >> 2] | 0) + -1 | 0;
                                c[ca >> 2] = sa;
                                if (sa) continue;
                                fa = +h[O >> 3] * +h[P >> 3];
                                h[P >> 3] = fa;
                                c[ca >> 2] = ~~fa;
                                fa = +h[Q >> 3] * +h[I >> 3];
                                h[I >> 3] = fa;
                                if ((c[R >> 2] | 0) <= 0) continue;
                                ga = c[C >> 2] | 0;
                                ea = c[T >> 2] | 0;
                                oa = c[q >> 2] | 0;
                                if (!oa) ha = o;
                                else ha = c[p >> 2] | 0;
                                ha = c[ha >> 2] | 0;
                                na = c[V >> 2] | 0;
                                ma = c[W >> 2] | 0;
                                la = c[X >> 2] | 0;
                                ka = s;
                                ia = c[ka >> 2] | 0;
                                ka = c[ka + 4 >> 2] | 0;
                                ja = +(c[Z >> 2] | 0);
                                qa = 1.0 / ja;
                                if ((oa | 0) < 0) ta = 0.0;
                                else {
                                    pa = 0;
                                    ta = 0.0;
                                    while (1) {
                                        if (!pa) ra = 0;
                                        else ra = c[(c[p >> 2] | 0) + (pa + -1 << 2) >> 2] | 0;
                                        if ((pa | 0) == (oa | 0)) sa = o;
                                        else sa = (c[p >> 2] | 0) + (pa << 2) | 0;
                                        ta = ta + +S(+qa, + +(pa | 0)) * +((c[sa >> 2] | 0) - ra | 0);
                                        if ((pa | 0) == (oa | 0)) break;
                                        else pa = pa + 1 | 0
                                    }
                                }
                                c[_ >> 2] = ga;
                                c[_ + 4 >> 2] = ea - ha;
                                c[_ + 8 >> 2] = na;
                                c[_ + 12 >> 2] = ma;
                                c[_ + 16 >> 2] = ~~fa;
                                c[_ + 20 >> 2] = la;
                                sa = _ + 24 | 0;
                                h[k >> 3] = (+(ia >>> 0) + 4294967296.0 * +(ka >>> 0)) / +(la | 0);
                                c[sa >> 2] = c[k >> 2];
                                c[sa + 4 >> 2] = c[k + 4 >> 2];
                                sa = _ + 32 | 0;
                                h[k >> 3] = ta / ja * 100.0;
                                c[sa >> 2] = c[k >> 2];
                                c[sa + 4 >> 2] = c[k + 4 >> 2];
                                La(1832, _ | 0) | 0
                            }
                            if ((ga | 0) == 5) a[b >> 0] = a[536] | 0;
                            else if ((ga | 0) == 14) Ta(va(1) | 0, 48, 0);
                            else if ((ga | 0) == 41) {
                                fa = +(c[Z >> 2] | 0);
                                ja = 1.0 / fa;
                                r = c[q >> 2] | 0;
                                if ((r | 0) < 0) qa = 0.0;
                                else {
                                    q = 0;
                                    qa = 0.0;
                                    while (1) {
                                        if (!q) s = 0;
                                        else s = c[(c[p >> 2] | 0) + (q + -1 << 2) >> 2] | 0;
                                        if ((q | 0) == (r | 0)) t = o;
                                        else t = (c[p >> 2] | 0) + (q << 2) | 0;
                                        qa = qa + +S(+ja, + +(q | 0)) * +((c[t >> 2] | 0) - s | 0);
                                        if ((q | 0) == (r | 0)) break;
                                        else q = q + 1 | 0
                                    }
                                }
                                h[e + 528 >> 3] = qa / fa;
                                Rb(e, 0);
                                a[b >> 0] = a[544] | 0
                            } else if ((ga | 0) == 50) a[b >> 0] = a[536] | 0;
                            else if ((ga | 0) == 57) {
                                c[$ >> 2] = ka ^ 1;
                                sa = e + 16 | 0;
                                c[_ + 0 >> 2] = c[$ + 0 >> 2];
                                Vb(e, _, sa);
                                a[b >> 0] = a[536] | 0
                            } else if ((ga | 0) == 60) a[b >> 0] = a[528] | 0;
                            b = c[j >> 2] | 0;
                            if (!b) { i = n; return }
                            c[m >> 2] = 0;
                            Td(b);
                            c[j >> 2] = 0;
                            c[l >> 2] = 0;
                            i = n;
                            return
                        }

                        function $b(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0.0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0.0,
                                A = 0,
                                B = 0;
                            f = i;
                            i = i + 16 | 0;
                            j = f;
                            e = d + 4 | 0;
                            if (c[e >> 2] | 0) c[d + 8 >> 2] = 0;
                            g = d + 36 | 0;
                            k = d + 32 | 0;
                            if ((c[g >> 2] | 0) > 0) {
                                l = d + 16 | 0;
                                m = 0;
                                do {
                                    a[(c[l >> 2] | 0) + (c[(c[k >> 2] | 0) + (m << 2) >> 2] | 0) >> 0] = 0;
                                    m = m + 1 | 0
                                } while ((m | 0) < (c[g >> 2] | 0))
                            }
                            if (c[k >> 2] | 0) c[g >> 2] = 0;
                            k = d + 492 | 0;
                            if (!(a[k >> 0] | 0)) {
                                a[b >> 0] = a[536] | 0;
                                i = f;
                                return
                            }
                            l = d + 152 | 0;
                            y = l;
                            y = ne(c[y >> 2] | 0, c[y + 4 >> 2] | 0, 1, 0) | 0;
                            c[l >> 2] = y;
                            c[l + 4 >> 2] = F;
                            z = +h[d + 120 >> 3] * +(c[d + 208 >> 2] | 0);
                            l = d + 640 | 0;
                            h[l >> 3] = z;
                            v = +(c[d + 104 >> 2] | 0);
                            if (z < v) h[l >> 3] = v;
                            w = c[d + 136 >> 2] | 0;
                            h[d + 648 >> 3] = +(w | 0);
                            c[d + 656 >> 2] = w;
                            w = a[544] | 0;
                            l = d + 44 | 0;
                            if ((c[l >> 2] | 0) > 0) {
                                Ka(2288) | 0;
                                Ka(2368) | 0;
                                Ka(2448) | 0;
                                Ka(2528) | 0;
                                o = a[544] | 0
                            } else o = w;
                            n = d + 192 | 0;
                            m = d + 184 | 0;
                            y = o & 255;
                            a: do {
                                if ((y >>> 1 ^ 1) & w << 24 >> 24 == o << 24 >> 24 | w & 2 & y) {
                                    q = d + 80 | 0;
                                    t = d + 112 | 0;
                                    p = d + 108 | 0;
                                    o = d + 680 | 0;
                                    r = d + 664 | 0;
                                    s = d + 672 | 0;
                                    u = 0;
                                    while (1) {
                                        v = +h[t >> 3];
                                        if (!(a[q >> 0] | 0)) v = +S(+v, + +(u | 0));
                                        else {
                                            y = u + 1 | 0;
                                            if ((u | 0) > 0) {
                                                x = 0;
                                                w = 1;
                                                do {
                                                    x = x + 1 | 0;
                                                    w = w << 1 | 1
                                                } while ((w | 0) < (y | 0));
                                                y = w + -1 | 0
                                            } else {
                                                x = 0;
                                                y = 0
                                            }
                                            if ((y | 0) != (u | 0)) {
                                                w = u;
                                                do {
                                                    A = y >> 1;
                                                    x = x + -1 | 0;
                                                    w = (w | 0) % (A | 0) | 0;
                                                    y = A + -1 | 0
                                                } while ((y | 0) != (w | 0))
                                            }
                                            v = +S(+v, + +(x | 0))
                                        }
                                        _b(j, d, ~~(v * +(c[p >> 2] | 0)));
                                        w = a[j >> 0] | 0;
                                        if (a[o >> 0] | 0) break a;
                                        y = r;
                                        x = c[y + 4 >> 2] | 0;
                                        if ((x | 0) >= 0 ? (A = n, B = c[A + 4 >> 2] | 0, !(B >>> 0 < x >>> 0 | ((B | 0) == (x | 0) ? (c[A >> 2] | 0) >>> 0 < (c[y >> 2] | 0) >>> 0 : 0))) : 0) break a;
                                        y = s;
                                        x = c[y + 4 >> 2] | 0;
                                        if ((x | 0) >= 0 ? (B = m, A = c[B + 4 >> 2] | 0, !(A >>> 0 < x >>> 0 | ((A | 0) == (x | 0) ? (c[B >> 2] | 0) >>> 0 < (c[y >> 2] | 0) >>> 0 : 0))) : 0) break a;
                                        A = a[544] | 0;
                                        B = A & 255;
                                        if (!((B >>> 1 ^ 1) & w << 24 >> 24 == A << 24 >> 24 | w & 2 & B)) break;
                                        else u = u + 1 | 0
                                    }
                                }
                            } while (0);
                            if ((c[l >> 2] | 0) > 0) Ka(2528) | 0;
                            A = a[528] | 0;
                            B = A & 255;
                            j = w & 2;
                            if (!((B >>> 1 ^ 1) & w << 24 >> 24 == A << 24 >> 24 | j & B)) {
                                A = a[536] | 0;
                                B = A & 255;
                                if (((B >>> 1 ^ 1) & w << 24 >> 24 == A << 24 >> 24 | j & B | 0) != 0 ? (c[g >> 2] | 0) == 0 : 0) a[k >> 0] = 0
                            } else {
                                g = d + 540 | 0;
                                jc(e, c[g >> 2] | 0);
                                if ((c[g >> 2] | 0) > 0) {
                                    j = d + 332 | 0;
                                    k = 0;
                                    do {
                                        a[(c[e >> 2] | 0) + k >> 0] = a[(c[j >> 2] | 0) + k >> 0] | 0;
                                        k = k + 1 | 0
                                    } while ((k | 0) < (c[g >> 2] | 0))
                                }
                            }
                            Rb(d, 0);
                            a[b >> 0] = w;
                            i = f;
                            return
                        }

                        function ac(b, e) {
                            b = b | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0;
                            f = i;
                            h = b + 412 | 0;
                            vc(h);
                            k = b + 540 | 0;
                            if ((c[k >> 2] | 0) > 0) {
                                j = b + 544 | 0;
                                g = 0;
                                do {
                                    l = g << 1;
                                    n = c[h >> 2] | 0;
                                    m = n + (l * 12 | 0) + 4 | 0;
                                    if ((c[m >> 2] | 0) > 0) {
                                        p = n + (l * 12 | 0) | 0;
                                        o = 0;
                                        do {
                                            s = (c[p >> 2] | 0) + (o << 3) | 0;
                                            n = c[s >> 2] | 0;
                                            q = c[j >> 2] | 0;
                                            r = q + (n << 2) | 0;
                                            if (!(c[r >> 2] & 16)) {
                                                t = wc(e, r) | 0;
                                                c[s >> 2] = t;
                                                c[r >> 2] = c[r >> 2] | 16;
                                                c[q + (n + 1 << 2) >> 2] = t
                                            } else c[s >> 2] = c[q + (n + 1 << 2) >> 2];
                                            o = o + 1 | 0
                                        } while ((o | 0) < (c[m >> 2] | 0));
                                        m = c[h >> 2] | 0
                                    } else m = n;
                                    n = l | 1;
                                    l = m + (n * 12 | 0) + 4 | 0;
                                    if ((c[l >> 2] | 0) > 0) {
                                        r = m + (n * 12 | 0) | 0;
                                        q = 0;
                                        do {
                                            m = (c[r >> 2] | 0) + (q << 3) | 0;
                                            p = c[m >> 2] | 0;
                                            o = c[j >> 2] | 0;
                                            n = o + (p << 2) | 0;
                                            if (!(c[n >> 2] & 16)) {
                                                t = wc(e, n) | 0;
                                                c[m >> 2] = t;
                                                c[n >> 2] = c[n >> 2] | 16;
                                                c[o + (p + 1 << 2) >> 2] = t
                                            } else c[m >> 2] = c[o + (p + 1 << 2) >> 2];
                                            q = q + 1 | 0
                                        } while ((q | 0) < (c[l >> 2] | 0))
                                    }
                                    g = g + 1 | 0
                                } while ((g | 0) < (c[k >> 2] | 0))
                            }
                            g = b + 284 | 0;
                            if ((c[g >> 2] | 0) > 0) {
                                l = b + 280 | 0;
                                k = b + 396 | 0;
                                j = b + 544 | 0;
                                h = b + 332 | 0;
                                m = 0;
                                do {
                                    r = c[k >> 2] | 0;
                                    p = r + (c[(c[l >> 2] | 0) + (m << 2) >> 2] >> 1 << 3) | 0;
                                    q = c[p >> 2] | 0;
                                    do {
                                        if ((q | 0) != -1) {
                                            t = c[j >> 2] | 0;
                                            s = t + (q << 2) | 0;
                                            o = (c[s >> 2] & 16 | 0) == 0;
                                            if (o) {
                                                u = c[t + (q + 1 << 2) >> 2] | 0;
                                                n = u >> 1;
                                                u = (d[(c[h >> 2] | 0) + n >> 0] | 0) ^ u & 1;
                                                w = a[528] | 0;
                                                v = w & 255;
                                                if (!((u & 255) << 24 >> 24 == w << 24 >> 24 & (v >>> 1 ^ 1) | v & 2 & u)) break;
                                                w = c[r + (n << 3) >> 2] | 0;
                                                if (!((w | 0) != -1 & (w | 0) == (q | 0))) break;
                                                if (o) {
                                                    w = wc(e, s) | 0;
                                                    c[p >> 2] = w;
                                                    c[s >> 2] = c[s >> 2] | 16;
                                                    c[t + (q + 1 << 2) >> 2] = w;
                                                    break
                                                }
                                            }
                                            c[p >> 2] = c[t + (q + 1 << 2) >> 2]
                                        }
                                    } while (0);
                                    m = m + 1 | 0
                                } while ((m | 0) < (c[g >> 2] | 0))
                            }
                            g = b + 272 | 0;
                            n = c[g >> 2] | 0;
                            if ((n | 0) > 0) {
                                j = b + 268 | 0;
                                h = b + 544 | 0;
                                m = c[j >> 2] | 0;
                                k = 0;
                                l = 0;
                                do {
                                    p = m + (k << 2) | 0;
                                    o = c[p >> 2] | 0;
                                    r = c[h >> 2] | 0;
                                    q = r + (o << 2) | 0;
                                    s = c[q >> 2] | 0;
                                    if ((s & 3 | 0) != 1) {
                                        if (!(s & 16)) {
                                            n = wc(e, q) | 0;
                                            c[p >> 2] = n;
                                            c[q >> 2] = c[q >> 2] | 16;
                                            c[r + (o + 1 << 2) >> 2] = n;
                                            n = c[j >> 2] | 0;
                                            m = n;
                                            n = c[n + (k << 2) >> 2] | 0
                                        } else {
                                            n = c[r + (o + 1 << 2) >> 2] | 0;
                                            c[p >> 2] = n
                                        }
                                        c[m + (l << 2) >> 2] = n;
                                        n = c[g >> 2] | 0;
                                        l = l + 1 | 0
                                    }
                                    k = k + 1 | 0
                                } while ((k | 0) < (n | 0))
                            } else {
                                k = 0;
                                l = 0
                            }
                            h = k - l | 0;
                            if ((h | 0) > 0) c[g >> 2] = n - h;
                            g = b + 260 | 0;
                            m = c[g >> 2] | 0;
                            if ((m | 0) > 0) {
                                h = b + 256 | 0;
                                b = b + 544 | 0;
                                l = c[h >> 2] | 0;
                                j = 0;
                                k = 0;
                                do {
                                    n = l + (j << 2) | 0;
                                    p = c[n >> 2] | 0;
                                    o = c[b >> 2] | 0;
                                    r = o + (p << 2) | 0;
                                    q = c[r >> 2] | 0;
                                    if ((q & 3 | 0) != 1) {
                                        if (!(q & 16)) {
                                            m = wc(e, r) | 0;
                                            c[n >> 2] = m;
                                            c[r >> 2] = c[r >> 2] | 16;
                                            c[o + (p + 1 << 2) >> 2] = m;
                                            m = c[h >> 2] | 0;
                                            l = m;
                                            m = c[m + (j << 2) >> 2] | 0
                                        } else {
                                            m = c[o + (p + 1 << 2) >> 2] | 0;
                                            c[n >> 2] = m
                                        }
                                        c[l + (k << 2) >> 2] = m;
                                        m = c[g >> 2] | 0;
                                        k = k + 1 | 0
                                    }
                                    j = j + 1 | 0
                                } while ((j | 0) < (m | 0))
                            } else {
                                j = 0;
                                k = 0
                            }
                            e = j - k | 0;
                            if ((e | 0) <= 0) { i = f; return }
                            c[g >> 2] = m - e;
                            i = f;
                            return
                        }

                        function bc(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0;
                            g = i;
                            i = i + 32 | 0;
                            j = g;
                            d = g + 8 | 0;
                            e = b + 548 | 0;
                            f = b + 556 | 0;
                            h = (c[e >> 2] | 0) - (c[f >> 2] | 0) | 0;
                            c[d + 0 >> 2] = 0;
                            c[d + 4 >> 2] = 0;
                            c[d + 8 >> 2] = 0;
                            c[d + 12 >> 2] = 0;
                            gc(d, h);
                            h = d + 16 | 0;
                            a[h >> 0] = 0;
                            ac(b, d);
                            if ((c[b + 44 >> 2] | 0) > 1) {
                                k = c[d + 4 >> 2] << 2;
                                c[j >> 2] = c[e >> 2] << 2;
                                c[j + 4 >> 2] = k;
                                La(1888, j | 0) | 0
                            }
                            a[b + 560 >> 0] = a[h >> 0] | 0;
                            h = b + 544 | 0;
                            j = c[h >> 2] | 0;
                            if (j) Td(j);
                            c[h >> 2] = c[d >> 2];
                            c[e >> 2] = c[d + 4 >> 2];
                            c[b + 552 >> 2] = c[d + 8 >> 2];
                            c[f >> 2] = c[d + 12 >> 2];
                            i = g;
                            return
                        }

                        function cc() {
                            var d = 0,
                                e = 0,
                                f = 0;
                            d = i;
                            i = i + 16 | 0;
                            e = d;
                            a[528] = 0;
                            a[536] = 1;
                            a[544] = 2;
                            xb(552, 608, 624, 2136, 2144);
                            c[138] = 2168;
                            h[72] = 0.0;
                            h[73] = 1.0;
                            a[592] = 0;
                            a[593] = 0;
                            b[297] = b[e + 0 >> 1] | 0;
                            b[298] = b[e + 2 >> 1] | 0;
                            b[299] = b[e + 4 >> 1] | 0;
                            h[75] = .95;
                            xb(664, 720, 736, 2136, 2144);
                            c[166] = 2168;
                            h[86] = 0.0;
                            h[87] = 1.0;
                            a[704] = 0;
                            a[705] = 0;
                            b[353] = b[e + 0 >> 1] | 0;
                            b[354] = b[e + 2 >> 1] | 0;
                            b[355] = b[e + 4 >> 1] | 0;
                            h[89] = .999;
                            xb(776, 832, 848, 2136, 2144);
                            c[194] = 2168;
                            h[100] = 0.0;
                            h[101] = 1.0;
                            a[816] = 1;
                            a[817] = 1;
                            b[409] = b[e + 0 >> 1] | 0;
                            b[410] = b[e + 2 >> 1] | 0;
                            b[411] = b[e + 4 >> 1] | 0;
                            h[103] = 0.0;
                            xb(936, 992, 1008, 2136, 2144);
                            c[234] = 2168;
                            h[120] = 0.0;
                            h[121] = v;
                            a[976] = 0;
                            a[977] = 0;
                            b[489] = b[e + 0 >> 1] | 0;
                            b[490] = b[e + 2 >> 1] | 0;
                            b[491] = b[e + 4 >> 1] | 0;
                            h[123] = 91648253.0;
                            xb(1048, 1080, 1096, 2136, 2016);
                            c[262] = 280;
                            f = 1068 | 0;
                            c[f >> 2] = 0;
                            c[f + 4 >> 2] = 2;
                            c[269] = 2;
                            xb(1160, 1192, 1208, 2136, 2016);
                            c[290] = 280;
                            f = 1180 | 0;
                            c[f >> 2] = 0;
                            c[f + 4 >> 2] = 2;
                            c[297] = 2;
                            xb(1272, 1296, 1312, 2136, 1992);
                            c[318] = 160;
                            a[1292] = 0;
                            xb(1344, 1368, 1376, 2136, 1992);
                            c[336] = 160;
                            a[1364] = 1;
                            xb(1408, 1440, 1448, 2136, 2016);
                            c[352] = 280;
                            f = 1428 | 0;
                            c[f >> 2] = 1;
                            c[f + 4 >> 2] = 2147483647;
                            c[359] = 100;
                            xb(1480, 1536, 1544, 2136, 2144);
                            c[370] = 2168;
                            h[188] = 1.0;
                            h[189] = v;
                            a[1520] = 0;
                            a[1521] = 0;
                            b[761] = b[e + 0 >> 1] | 0;
                            b[762] = b[e + 2 >> 1] | 0;
                            b[763] = b[e + 4 >> 1] | 0;
                            h[191] = 2.0;
                            xb(1584, 1640, 1648, 2136, 2144);
                            c[396] = 2168;
                            h[201] = 0.0;
                            h[202] = v;
                            a[1624] = 0;
                            a[1625] = 0;
                            b[813] = b[e + 0 >> 1] | 0;
                            b[814] = b[e + 2 >> 1] | 0;
                            b[815] = b[e + 4 >> 1] | 0;
                            h[204] = .2;
                            xb(1728, 1760, 1776, 2136, 2016);
                            c[432] = 280;
                            e = 1748 | 0;
                            c[e >> 2] = 0;
                            c[e + 4 >> 2] = 2147483647;
                            c[439] = 0;
                            i = d;
                            return
                        }

                        function dc(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            pd(a);
                            i = b;
                            return
                        }

                        function ec(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                q = 0.0,
                                r = 0.0;
                            e = i;
                            i = i + 16 | 0;
                            j = e;
                            g = e + 8 | 0;
                            if ((a[d >> 0] | 0) != 45) {
                                o = 0;
                                i = e;
                                return o | 0
                            }
                            m = d + 1 | 0;
                            f = b + 4 | 0;
                            k = c[f >> 2] | 0;
                            l = a[k >> 0] | 0;
                            a: do {
                                if (l << 24 >> 24) {
                                    n = 0;
                                    while (1) {
                                        o = n;
                                        n = n + 1 | 0;
                                        if ((a[m >> 0] | 0) != l << 24 >> 24) { b = 0; break }
                                        l = a[k + n >> 0] | 0;
                                        m = d + (o + 2) | 0;
                                        if (!(l << 24 >> 24)) break a
                                    }
                                    i = e;
                                    return b | 0
                                }
                            } while (0);
                            if ((a[m >> 0] | 0) != 61) {
                                o = 0;
                                i = e;
                                return o | 0
                            }
                            k = m + 1 | 0;
                            q = +ce(k, g);
                            if (!(c[g >> 2] | 0)) {
                                o = 0;
                                i = e;
                                return o | 0
                            }
                            r = +h[b + 32 >> 3];
                            if (q >= r ? (a[b + 41 >> 0] | 0) == 0 | q != r : 0) {
                                o = c[p >> 2] | 0;
                                n = c[f >> 2] | 0;
                                c[j >> 2] = k;
                                c[j + 4 >> 2] = n;
                                Za(o | 0, 2024, j | 0) | 0;
                                ab(1)
                            }
                            r = +h[b + 24 >> 3];
                            if (q <= r ? (a[b + 40 >> 0] | 0) == 0 | q != r : 0) {
                                o = c[p >> 2] | 0;
                                n = c[f >> 2] | 0;
                                c[j >> 2] = k;
                                c[j + 4 >> 2] = n;
                                Za(o | 0, 2080, j | 0) | 0;
                                ab(1)
                            }
                            h[b + 48 >> 3] = q;
                            o = 1;
                            i = e;
                            return o | 0
                        }

                        function fc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                l = 0.0,
                                m = 0,
                                n = 0.0,
                                o = 0.0,
                                q = 0;
                            e = i;
                            i = i + 48 | 0;
                            f = e;
                            g = c[p >> 2] | 0;
                            q = c[b + 16 >> 2] | 0;
                            m = (a[b + 40 >> 0] | 0) != 0 ? 91 : 40;
                            o = +h[b + 24 >> 3];
                            n = +h[b + 32 >> 3];
                            j = (a[b + 41 >> 0] | 0) != 0 ? 93 : 41;
                            l = +h[b + 48 >> 3];
                            c[f >> 2] = c[b + 4 >> 2];
                            c[f + 4 >> 2] = q;
                            c[f + 8 >> 2] = m;
                            m = f + 12 | 0;
                            h[k >> 3] = o;
                            c[m >> 2] = c[k >> 2];
                            c[m + 4 >> 2] = c[k + 4 >> 2];
                            m = f + 20 | 0;
                            h[k >> 3] = n;
                            c[m >> 2] = c[k >> 2];
                            c[m + 4 >> 2] = c[k + 4 >> 2];
                            c[f + 28 >> 2] = j;
                            j = f + 32 | 0;
                            h[k >> 3] = l;
                            c[j >> 2] = c[k >> 2];
                            c[j + 4 >> 2] = c[k + 4 >> 2];
                            Za(g | 0, 2232, f | 0) | 0;
                            if (!d) { i = e; return }
                            c[f >> 2] = c[b + 8 >> 2];
                            Za(g | 0, 2e3, f | 0) | 0;
                            Sa(10, g | 0) | 0;
                            i = e;
                            return
                        }

                        function gc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0;
                            d = i;
                            e = a + 8 | 0;
                            f = c[e >> 2] | 0;
                            if (f >>> 0 < b >>> 0) h = f;
                            else { i = d; return }
                            while (1) {
                                if (h >>> 0 >= b >>> 0) break;
                                h = ((h >>> 3) + 2 + (h >>> 1) & -2) + h | 0;
                                c[e >> 2] = h;
                                if (h >>> 0 <= f >>> 0) { g = 4; break }
                            }
                            if ((g | 0) == 4) Ta(va(1) | 0, 48, 0);
                            e = Ud(c[a >> 2] | 0, h << 2) | 0;
                            if ((e | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) Ta(va(1) | 0, 48, 0);
                            c[a >> 2] = e;
                            i = d;
                            return
                        }

                        function hc(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0;
                            b = i;
                            e = a + 32 | 0;
                            d = c[e >> 2] | 0;
                            if (d) {
                                c[a + 36 >> 2] = 0;
                                Td(d);
                                c[e >> 2] = 0;
                                c[a + 40 >> 2] = 0
                            }
                            e = a + 16 | 0;
                            d = c[e >> 2] | 0;
                            if (d) {
                                c[a + 20 >> 2] = 0;
                                Td(d);
                                c[e >> 2] = 0;
                                c[a + 24 >> 2] = 0
                            }
                            e = c[a >> 2] | 0;
                            if (!e) { i = b; return }
                            d = a + 4 | 0;
                            g = c[d >> 2] | 0;
                            if ((g | 0) > 0) {
                                f = 0;
                                do {
                                    j = e + (f * 12 | 0) | 0;
                                    h = c[j >> 2] | 0;
                                    if (h) {
                                        c[e + (f * 12 | 0) + 4 >> 2] = 0;
                                        Td(h);
                                        c[j >> 2] = 0;
                                        c[e + (f * 12 | 0) + 8 >> 2] = 0;
                                        e = c[a >> 2] | 0;
                                        g = c[d >> 2] | 0
                                    }
                                    f = f + 1 | 0
                                } while ((f | 0) < (g | 0))
                            }
                            c[d >> 2] = 0;
                            Td(e);
                            c[a >> 2] = 0;
                            c[a + 8 >> 2] = 0;
                            i = b;
                            return
                        }

                        function ic(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0;
                            f = i;
                            i = i + 16 | 0;
                            e = f + 4 | 0;
                            d = f;
                            l = c[b >> 2] | 0;
                            h = l + 1 | 0;
                            g = a + 4 | 0;
                            if ((c[g >> 2] | 0) < (h | 0)) {
                                k = a + 8 | 0;
                                j = c[k >> 2] | 0;
                                if ((j | 0) < (h | 0)) {
                                    m = l + 2 - j & -2;
                                    l = (j >> 1) + 2 & -2;
                                    l = (m | 0) > (l | 0) ? m : l;
                                    if ((l | 0) > (2147483647 - j | 0)) {
                                        m = va(1) | 0;
                                        Ta(m | 0, 48, 0)
                                    }
                                    n = c[a >> 2] | 0;
                                    m = l + j | 0;
                                    c[k >> 2] = m;
                                    m = Ud(n, m * 12 | 0) | 0;
                                    c[a >> 2] = m;
                                    if ((m | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        n = va(1) | 0;
                                        Ta(n | 0, 48, 0)
                                    }
                                }
                                k = c[g >> 2] | 0;
                                if ((k | 0) < (h | 0)) {
                                    j = c[a >> 2] | 0;
                                    do {
                                        l = j + (k * 12 | 0) | 0;
                                        if (l) {
                                            c[l >> 2] = 0;
                                            c[j + (k * 12 | 0) + 4 >> 2] = 0;
                                            c[j + (k * 12 | 0) + 8 >> 2] = 0
                                        }
                                        k = k + 1 | 0
                                    } while ((k | 0) != (h | 0))
                                }
                                c[g >> 2] = h;
                                l = c[b >> 2] | 0
                            }
                            g = c[a >> 2] | 0;
                            if (!(c[g + (l * 12 | 0) >> 2] | 0)) {
                                m = l;
                                n = a + 16 | 0;
                                c[d >> 2] = m;
                                c[e + 0 >> 2] = c[d + 0 >> 2];
                                sc(n, e, 0);
                                i = f;
                                return
                            }
                            c[g + (l * 12 | 0) + 4 >> 2] = 0;
                            m = c[b >> 2] | 0;
                            n = a + 16 | 0;
                            c[d >> 2] = m;
                            c[e + 0 >> 2] = c[d + 0 >> 2];
                            sc(n, e, 0);
                            i = f;
                            return
                        }

                        function jc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0;
                            f = i;
                            e = b + 4 | 0;
                            if ((c[e >> 2] | 0) >= (d | 0)) { i = f; return }
                            h = b + 8 | 0;
                            g = c[h >> 2] | 0;
                            if ((g | 0) < (d | 0)) {
                                k = d + 1 - g & -2;
                                j = (g >> 1) + 2 & -2;
                                j = (k | 0) > (j | 0) ? k : j;
                                if ((j | 0) > (2147483647 - g | 0)) {
                                    k = va(1) | 0;
                                    Ta(k | 0, 48, 0)
                                }
                                l = c[b >> 2] | 0;
                                k = j + g | 0;
                                c[h >> 2] = k;
                                k = Ud(l, k) | 0;
                                c[b >> 2] = k;
                                if ((k | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    l = va(1) | 0;
                                    Ta(l | 0, 48, 0)
                                }
                            }
                            g = c[e >> 2] | 0;
                            if ((g | 0) < (d | 0)) {
                                b = c[b >> 2] | 0;
                                do {
                                    h = b + g | 0;
                                    if (h) a[h >> 0] = 0;
                                    g = g + 1 | 0
                                } while ((g | 0) != (d | 0))
                            }
                            c[e >> 2] = d;
                            i = f;
                            return
                        }

                        function kc(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0;
                            h = i;
                            g = d + 1 | 0;
                            f = b + 4 | 0;
                            if ((c[f >> 2] | 0) >= (g | 0)) {
                                l = c[b >> 2] | 0;
                                l = l + d | 0;
                                a[l >> 0] = e;
                                i = h;
                                return
                            }
                            k = b + 8 | 0;
                            j = c[k >> 2] | 0;
                            if ((j | 0) < (g | 0)) {
                                m = d + 2 - j & -2;
                                l = (j >> 1) + 2 & -2;
                                l = (m | 0) > (l | 0) ? m : l;
                                if ((l | 0) > (2147483647 - j | 0)) {
                                    m = va(1) | 0;
                                    Ta(m | 0, 48, 0)
                                }
                                n = c[b >> 2] | 0;
                                m = l + j | 0;
                                c[k >> 2] = m;
                                m = Ud(n, m) | 0;
                                c[b >> 2] = m;
                                if ((m | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    n = va(1) | 0;
                                    Ta(n | 0, 48, 0)
                                }
                            }
                            j = c[f >> 2] | 0;
                            if ((j | 0) < (g | 0))
                                do {
                                    k = (c[b >> 2] | 0) + j | 0;
                                    if (k) a[k >> 0] = 0;
                                    j = j + 1 | 0
                                } while ((j | 0) != (g | 0));
                            c[f >> 2] = g;
                            n = c[b >> 2] | 0;
                            n = n + d | 0;
                            a[n >> 0] = e;
                            i = h;
                            return
                        }

                        function lc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0;
                            d = i;
                            i = i + 16 | 0;
                            g = d;
                            c[g >> 2] = b;
                            j = a + 12 | 0;
                            f = b + 1 | 0;
                            e = a + 16 | 0;
                            if ((c[e >> 2] | 0) < (f | 0)) {
                                l = a + 20 | 0;
                                k = c[l >> 2] | 0;
                                if ((k | 0) < (f | 0)) {
                                    n = b + 2 - k & -2;
                                    m = (k >> 1) + 2 & -2;
                                    m = (n | 0) > (m | 0) ? n : m;
                                    if ((m | 0) > (2147483647 - k | 0)) {
                                        n = va(1) | 0;
                                        Ta(n | 0, 48, 0)
                                    }
                                    o = c[j >> 2] | 0;
                                    n = m + k | 0;
                                    c[l >> 2] = n;
                                    n = Ud(o, n << 2) | 0;
                                    c[j >> 2] = n;
                                    if ((n | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        o = va(1) | 0;
                                        Ta(o | 0, 48, 0)
                                    }
                                }
                                k = c[e >> 2] | 0;
                                if ((f | 0) > (k | 0)) ke((c[j >> 2] | 0) + (k << 2) | 0, -1, f - k << 2 | 0) | 0;
                                c[e >> 2] = f
                            }
                            c[(c[j >> 2] | 0) + (b << 2) >> 2] = c[a + 4 >> 2];
                            nc(a, g);
                            e = c[j >> 2] | 0;
                            g = c[e + (b << 2) >> 2] | 0;
                            b = c[a >> 2] | 0;
                            f = c[b + (g << 2) >> 2] | 0;
                            if (!g) {
                                n = 0;
                                o = b + (n << 2) | 0;
                                c[o >> 2] = f;
                                o = e + (f << 2) | 0;
                                c[o >> 2] = n;
                                i = d;
                                return
                            }
                            a = a + 28 | 0;
                            while (1) {
                                j = g;
                                g = g + -1 >> 1;
                                k = b + (g << 2) | 0;
                                l = c[k >> 2] | 0;
                                o = c[c[a >> 2] >> 2] | 0;
                                if (!(+h[o + (f << 3) >> 3] > +h[o + (l << 3) >> 3])) { a = 14; break }
                                c[b + (j << 2) >> 2] = l;
                                c[e + (c[k >> 2] << 2) >> 2] = j;
                                if (!g) {
                                    j = 0;
                                    a = 14;
                                    break
                                }
                            }
                            if ((a | 0) == 14) {
                                o = b + (j << 2) | 0;
                                c[o >> 2] = f;
                                o = e + (f << 2) | 0;
                                c[o >> 2] = j;
                                i = d;
                                return
                            }
                        }

                        function mc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0;
                            d = i;
                            e = a + 4 | 0;
                            f = c[e >> 2] | 0;
                            g = a + 8 | 0;
                            h = c[g >> 2] | 0;
                            if ((f | 0) == (h | 0) & (h | 0) < (f + 1 | 0)) {
                                h = (f >> 1) + 2 & -2;
                                h = (h | 0) < 2 ? 2 : h;
                                if ((h | 0) > (2147483647 - f | 0)) {
                                    h = va(1) | 0;
                                    Ta(h | 0, 48, 0)
                                }
                                j = c[a >> 2] | 0;
                                f = h + f | 0;
                                c[g >> 2] = f;
                                f = Ud(j, f << 2) | 0;
                                c[a >> 2] = f;
                                if ((f | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    j = va(1) | 0;
                                    Ta(j | 0, 48, 0)
                                }
                            } else f = c[a >> 2] | 0;
                            j = c[e >> 2] | 0;
                            c[e >> 2] = j + 1;
                            e = f + (j << 2) | 0;
                            if (!e) { i = d; return }
                            c[e >> 2] = c[b >> 2];
                            i = d;
                            return
                        }

                        function nc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0;
                            d = i;
                            e = a + 4 | 0;
                            f = c[e >> 2] | 0;
                            g = a + 8 | 0;
                            h = c[g >> 2] | 0;
                            if ((f | 0) == (h | 0) & (h | 0) < (f + 1 | 0)) {
                                h = (f >> 1) + 2 & -2;
                                h = (h | 0) < 2 ? 2 : h;
                                if ((h | 0) > (2147483647 - f | 0)) {
                                    h = va(1) | 0;
                                    Ta(h | 0, 48, 0)
                                }
                                j = c[a >> 2] | 0;
                                f = h + f | 0;
                                c[g >> 2] = f;
                                f = Ud(j, f << 2) | 0;
                                c[a >> 2] = f;
                                if ((f | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    j = va(1) | 0;
                                    Ta(j | 0, 48, 0)
                                }
                            } else f = c[a >> 2] | 0;
                            j = c[e >> 2] | 0;
                            c[e >> 2] = j + 1;
                            e = f + (j << 2) | 0;
                            if (!e) { i = d; return }
                            c[e >> 2] = c[b >> 2];
                            i = d;
                            return
                        }

                        function oc(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0;
                            e = i;
                            i = i + 16 | 0;
                            f = e + 2 | 0;
                            h = e + 1 | 0;
                            g = e;
                            if ((d | 0) < 16) {
                                g = d + -1 | 0;
                                if ((g | 0) > 0) h = 0;
                                else { i = e; return }
                                do {
                                    f = h;
                                    h = h + 1 | 0;
                                    if ((h | 0) < (d | 0)) {
                                        k = f;
                                        j = h;
                                        do {
                                            k = (c[b + (j << 2) >> 2] | 0) < (c[b + (k << 2) >> 2] | 0) ? j : k;
                                            j = j + 1 | 0
                                        } while ((j | 0) != (d | 0))
                                    } else k = f;
                                    n = b + (f << 2) | 0;
                                    o = c[n >> 2] | 0;
                                    p = b + (k << 2) | 0;
                                    c[n >> 2] = c[p >> 2];
                                    c[p >> 2] = o
                                } while ((h | 0) != (g | 0));
                                i = e;
                                return
                            }
                            j = c[b + (((d | 0) / 2 | 0) << 2) >> 2] | 0;
                            m = -1;
                            n = d;
                            while (1) {
                                do {
                                    m = m + 1 | 0;
                                    l = b + (m << 2) | 0;
                                    k = c[l >> 2] | 0
                                } while ((k | 0) < (j | 0));
                                do {
                                    n = n + -1 | 0;
                                    o = b + (n << 2) | 0;
                                    p = c[o >> 2] | 0
                                } while ((j | 0) < (p | 0));
                                if ((m | 0) >= (n | 0)) break;
                                c[l >> 2] = p;
                                c[o >> 2] = k
                            }
                            a[f + 0 >> 0] = a[h + 0 >> 0] | 0;
                            oc(b, m, f);
                            p = d - m | 0;
                            a[f + 0 >> 0] = a[g + 0 >> 0] | 0;
                            oc(l, p, f);
                            i = e;
                            return
                        }

                        function pc(a, b, e) {
                            a = a | 0;
                            b = b | 0;
                            e = e | 0;
                            var f = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            f = i;
                            k = e & 1;
                            j = d[a + 16 >> 0] | 0 | k;
                            h = b + 4 | 0;
                            l = ((j + (c[h >> 2] | 0) << 2) + 4 | 0) >>> 2;
                            m = a + 4 | 0;
                            gc(a, l + (c[m >> 2] | 0) | 0);
                            e = c[m >> 2] | 0;
                            l = l + e | 0;
                            c[m >> 2] = l;
                            if (l >>> 0 < e >>> 0) Ta(va(1) | 0, 48, 0);
                            a = (c[a >> 2] | 0) + (e << 2) | 0;
                            if (!a) { i = f; return e | 0 }
                            j = j << 3 | k << 2;
                            c[a >> 2] = c[a >> 2] & -32 | j;
                            j = c[h >> 2] << 5 | j;
                            c[a >> 2] = j;
                            if ((c[h >> 2] | 0) > 0) {
                                j = c[b >> 2] | 0;
                                b = 0;
                                do {
                                    c[a + (b << 2) + 4 >> 2] = c[j + (b << 2) >> 2];
                                    b = b + 1 | 0
                                } while ((b | 0) < (c[h >> 2] | 0));
                                j = c[a >> 2] | 0
                            }
                            if (!(j & 8)) { i = f; return e | 0 }
                            h = j >>> 5;
                            if (j & 4) {
                                g[a + (h << 2) + 4 >> 2] = 0.0;
                                i = f;
                                return e | 0
                            }
                            if (!h) {
                                h = 0;
                                j = 0
                            } else {
                                j = 0;
                                b = 0;
                                do {
                                    j = 1 << ((c[a + (b << 2) + 4 >> 2] | 0) >>> 1 & 31) | j;
                                    b = b + 1 | 0
                                } while ((b | 0) < (h | 0))
                            }
                            c[a + (h << 2) + 4 >> 2] = j;
                            i = f;
                            return e | 0
                        }

                        function qc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0;
                            d = i;
                            e = a + 4 | 0;
                            f = c[e >> 2] | 0;
                            g = a + 8 | 0;
                            h = c[g >> 2] | 0;
                            if ((f | 0) == (h | 0) & (h | 0) < (f + 1 | 0)) {
                                h = (f >> 1) + 2 & -2;
                                h = (h | 0) < 2 ? 2 : h;
                                if ((h | 0) > (2147483647 - f | 0)) {
                                    h = va(1) | 0;
                                    Ta(h | 0, 48, 0)
                                }
                                j = c[a >> 2] | 0;
                                f = h + f | 0;
                                c[g >> 2] = f;
                                f = Ud(j, f << 3) | 0;
                                c[a >> 2] = f;
                                if ((f | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    j = va(1) | 0;
                                    Ta(j | 0, 48, 0)
                                }
                            } else f = c[a >> 2] | 0;
                            j = c[e >> 2] | 0;
                            c[e >> 2] = j + 1;
                            e = f + (j << 3) | 0;
                            if (!e) { i = d; return }
                            g = b;
                            h = c[g + 4 >> 2] | 0;
                            j = e;
                            c[j >> 2] = c[g >> 2];
                            c[j + 4 >> 2] = h;
                            i = d;
                            return
                        }

                        function rc(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0.0,
                                r = 0.0,
                                s = 0;
                            b = i;
                            d = c[a >> 2] | 0;
                            f = c[d >> 2] | 0;
                            k = a + 4 | 0;
                            o = c[d + ((c[k >> 2] | 0) + -1 << 2) >> 2] | 0;
                            c[d >> 2] = o;
                            e = c[a + 12 >> 2] | 0;
                            c[e + (o << 2) >> 2] = 0;
                            c[e + (f << 2) >> 2] = -1;
                            o = (c[k >> 2] | 0) + -1 | 0;
                            c[k >> 2] = o;
                            if ((o | 0) <= 1) { i = b; return f | 0 }
                            g = c[d >> 2] | 0;
                            l = a + 28 | 0;
                            a = 0;
                            m = 1;
                            while (1) {
                                n = (a << 1) + 2 | 0;
                                if ((n | 0) < (o | 0)) {
                                    p = c[d + (n << 2) >> 2] | 0;
                                    s = c[d + (m << 2) >> 2] | 0;
                                    o = c[c[l >> 2] >> 2] | 0;
                                    q = +h[o + (p << 3) >> 3];
                                    r = +h[o + (s << 3) >> 3];
                                    if (!(q > r)) {
                                        p = s;
                                        q = r;
                                        j = 6
                                    }
                                } else {
                                    o = c[c[l >> 2] >> 2] | 0;
                                    j = c[d + (m << 2) >> 2] | 0;
                                    p = j;
                                    q = +h[o + (j << 3) >> 3];
                                    j = 6
                                }
                                if ((j | 0) == 6) {
                                    j = 0;
                                    n = m
                                }
                                if (!(q > +h[o + (g << 3) >> 3])) break;
                                c[d + (a << 2) >> 2] = p;
                                c[e + (p << 2) >> 2] = a;
                                m = n << 1 | 1;
                                o = c[k >> 2] | 0;
                                if ((m | 0) >= (o | 0)) { a = n; break } else a = n
                            }
                            c[d + (a << 2) >> 2] = g;
                            c[e + (g << 2) >> 2] = a;
                            i = b;
                            return f | 0
                        }

                        function sc(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            f = i;
                            k = c[d >> 2] | 0;
                            d = k + 1 | 0;
                            g = b + 4 | 0;
                            if ((c[g >> 2] | 0) >= (d | 0)) { i = f; return }
                            j = b + 8 | 0;
                            h = c[j >> 2] | 0;
                            if ((h | 0) < (d | 0)) {
                                l = k + 2 - h & -2;
                                k = (h >> 1) + 2 & -2;
                                k = (l | 0) > (k | 0) ? l : k;
                                if ((k | 0) > (2147483647 - h | 0)) {
                                    l = va(1) | 0;
                                    Ta(l | 0, 48, 0)
                                }
                                m = c[b >> 2] | 0;
                                l = k + h | 0;
                                c[j >> 2] = l;
                                l = Ud(m, l) | 0;
                                c[b >> 2] = l;
                                if ((l | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    m = va(1) | 0;
                                    Ta(m | 0, 48, 0)
                                }
                            }
                            h = c[g >> 2] | 0;
                            if ((h | 0) < (d | 0))
                                do {
                                    a[(c[b >> 2] | 0) + h >> 0] = e;
                                    h = h + 1 | 0
                                } while ((h | 0) != (d | 0));
                            c[g >> 2] = d;
                            i = f;
                            return
                        }

                        function tc(a, b, d) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0;
                            e = i;
                            i = i + 16 | 0;
                            h = e + 8 | 0;
                            f = e + 4 | 0;
                            j = e;
                            if ((b | 0) < 16) {
                                f = b + -1 | 0;
                                if ((f | 0) <= 0) { i = e; return }
                                h = c[d >> 2] | 0;
                                d = 0;
                                do {
                                    j = d;
                                    d = d + 1 | 0;
                                    if ((d | 0) < (b | 0)) {
                                        k = c[h >> 2] | 0;
                                        m = j;
                                        l = d;
                                        do {
                                            n = k + (c[a + (l << 2) >> 2] << 2) | 0;
                                            u = c[n >> 2] | 0;
                                            q = u >>> 5;
                                            if (u >>> 0 > 95) {
                                                o = k + (c[a + (m << 2) >> 2] << 2) | 0;
                                                p = (c[o >> 2] | 0) >>> 5;
                                                if ((p | 0) == 2) m = l;
                                                else m = +g[n + (q << 2) + 4 >> 2] < +g[o + (p << 2) + 4 >> 2] ? l : m
                                            }
                                            l = l + 1 | 0
                                        } while ((l | 0) != (b | 0))
                                    } else m = j;
                                    s = a + (j << 2) | 0;
                                    t = c[s >> 2] | 0;
                                    u = a + (m << 2) | 0;
                                    c[s >> 2] = c[u >> 2];
                                    c[u >> 2] = t
                                } while ((d | 0) != (f | 0));
                                i = e;
                                return
                            }
                            k = c[a + (((b | 0) / 2 | 0) << 2) >> 2] | 0;
                            q = -1;
                            o = b;
                            while (1) {
                                t = q + 1 | 0;
                                p = a + (t << 2) | 0;
                                u = c[p >> 2] | 0;
                                l = c[d >> 2] | 0;
                                m = c[l >> 2] | 0;
                                s = m + (u << 2) | 0;
                                r = c[s >> 2] | 0;
                                q = m + (k << 2) | 0;
                                n = c[q >> 2] | 0;
                                a: do {
                                    if (r >>> 0 > 95)
                                        while (1) {
                                            v = n >>> 5;
                                            if ((v | 0) != 2 ? !(+g[s + (r >>> 5 << 2) + 4 >> 2] < +g[q + (v << 2) + 4 >> 2]) : 0) { q = t; break a }
                                            t = t + 1 | 0;
                                            p = a + (t << 2) | 0;
                                            u = c[p >> 2] | 0;
                                            s = m + (u << 2) | 0;
                                            r = c[s >> 2] | 0;
                                            if (r >>> 0 <= 95) { q = t; break }
                                        } else q = t
                                } while (0);
                                o = o + -1 | 0;
                                s = a + (o << 2) | 0;
                                r = m + (k << 2) | 0;
                                b: do {
                                    if (n >>> 0 > 95)
                                        while (1) {
                                            t = m + (c[s >> 2] << 2) | 0;
                                            v = (c[t >> 2] | 0) >>> 5;
                                            if ((v | 0) != 2 ? !(+g[r + (n >>> 5 << 2) + 4 >> 2] < +g[t + (v << 2) + 4 >> 2]) : 0) break b;
                                            v = o + -1 | 0;
                                            s = a + (v << 2) | 0;
                                            o = v
                                        }
                                } while (0);
                                if ((q | 0) >= (o | 0)) break;
                                c[p >> 2] = c[s >> 2];
                                c[s >> 2] = u
                            }
                            c[f >> 2] = l;
                            c[h + 0 >> 2] = c[f + 0 >> 2];
                            tc(a, q, h);
                            v = b - q | 0;
                            c[j >> 2] = l;
                            c[h + 0 >> 2] = c[j + 0 >> 2];
                            tc(p, v, h);
                            i = e;
                            return
                        }

                        function uc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0.0,
                                r = 0.0,
                                s = 0;
                            e = i;
                            f = a + 4 | 0;
                            j = c[f >> 2] | 0;
                            g = c[a >> 2] | 0;
                            if ((j | 0) > 0) {
                                l = c[a + 12 >> 2] | 0;
                                k = 0;
                                do {
                                    c[l + (c[g + (k << 2) >> 2] << 2) >> 2] = -1;
                                    k = k + 1 | 0;
                                    j = c[f >> 2] | 0
                                } while ((k | 0) < (j | 0))
                            }
                            if (g) {
                                c[f >> 2] = 0;
                                j = 0
                            }
                            g = b + 4 | 0;
                            if ((c[g >> 2] | 0) > 0) {
                                k = a + 12 | 0;
                                j = 0;
                                do {
                                    s = (c[b >> 2] | 0) + (j << 2) | 0;
                                    c[(c[k >> 2] | 0) + (c[s >> 2] << 2) >> 2] = j;
                                    nc(a, s);
                                    j = j + 1 | 0
                                } while ((j | 0) < (c[g >> 2] | 0));
                                j = c[f >> 2] | 0
                            }
                            if ((j | 0) <= 1) { i = e; return }
                            g = c[a >> 2] | 0;
                            b = a + 28 | 0;
                            a = a + 12 | 0;
                            o = j;
                            k = (j | 0) / 2 | 0;
                            while (1) {
                                k = k + -1 | 0;
                                j = c[g + (k << 2) >> 2] | 0;
                                m = k << 1 | 1;
                                a: do {
                                    if ((m | 0) < (o | 0)) {
                                        l = k;
                                        while (1) {
                                            n = (l << 1) + 2 | 0;
                                            if ((n | 0) < (o | 0)) {
                                                p = c[g + (n << 2) >> 2] | 0;
                                                s = c[g + (m << 2) >> 2] | 0;
                                                o = c[c[b >> 2] >> 2] | 0;
                                                q = +h[o + (p << 3) >> 3];
                                                r = +h[o + (s << 3) >> 3];
                                                if (!(q > r)) {
                                                    p = s;
                                                    q = r;
                                                    d = 16
                                                }
                                            } else {
                                                o = c[c[b >> 2] >> 2] | 0;
                                                d = c[g + (m << 2) >> 2] | 0;
                                                p = d;
                                                q = +h[o + (d << 3) >> 3];
                                                d = 16
                                            }
                                            if ((d | 0) == 16) {
                                                d = 0;
                                                n = m
                                            }
                                            if (!(q > +h[o + (j << 3) >> 3])) break a;
                                            c[g + (l << 2) >> 2] = p;
                                            c[(c[a >> 2] | 0) + (p << 2) >> 2] = l;
                                            m = n << 1 | 1;
                                            o = c[f >> 2] | 0;
                                            if ((m | 0) >= (o | 0)) { l = n; break } else l = n
                                        }
                                    } else l = k
                                } while (0);
                                c[g + (l << 2) >> 2] = j;
                                c[(c[a >> 2] | 0) + (j << 2) >> 2] = l;
                                if ((k | 0) <= 0) break;
                                o = c[f >> 2] | 0
                            }
                            i = e;
                            return
                        }

                        function vc(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0;
                            e = i;
                            d = b + 36 | 0;
                            l = c[d >> 2] | 0;
                            f = b + 32 | 0;
                            n = c[f >> 2] | 0;
                            if ((l | 0) > 0) {
                                h = b + 16 | 0;
                                g = b + 44 | 0;
                                j = 0;
                                do {
                                    k = n + (j << 2) | 0;
                                    m = c[k >> 2] | 0;
                                    if (a[(c[h >> 2] | 0) + m >> 0] | 0) {
                                        n = c[b >> 2] | 0;
                                        l = n + (m * 12 | 0) + 4 | 0;
                                        p = c[l >> 2] | 0;
                                        if ((p | 0) > 0) {
                                            m = n + (m * 12 | 0) | 0;
                                            n = 0;
                                            o = 0;
                                            do {
                                                q = c[m >> 2] | 0;
                                                r = q + (n << 3) | 0;
                                                if ((c[(c[c[g >> 2] >> 2] | 0) + (c[r >> 2] << 2) >> 2] & 3 | 0) != 1) {
                                                    s = r;
                                                    r = c[s + 4 >> 2] | 0;
                                                    p = q + (o << 3) | 0;
                                                    c[p >> 2] = c[s >> 2];
                                                    c[p + 4 >> 2] = r;
                                                    p = c[l >> 2] | 0;
                                                    o = o + 1 | 0
                                                }
                                                n = n + 1 | 0
                                            } while ((n | 0) < (p | 0))
                                        } else {
                                            n = 0;
                                            o = 0
                                        }
                                        m = n - o | 0;
                                        if ((m | 0) > 0) c[l >> 2] = p - m;
                                        a[(c[h >> 2] | 0) + (c[k >> 2] | 0) >> 0] = 0;
                                        l = c[d >> 2] | 0;
                                        n = c[f >> 2] | 0
                                    }
                                    j = j + 1 | 0
                                } while ((j | 0) < (l | 0))
                            }
                            if (!n) { i = e; return }
                            c[d >> 2] = 0;
                            i = e;
                            return
                        }

                        function wc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var e = 0,
                                f = 0,
                                h = 0,
                                j = 0,
                                k = 0;
                            f = i;
                            j = c[b >> 2] | 0;
                            h = j >>> 2 & 1 | (d[a + 16 >> 0] | 0);
                            j = ((h + (j >>> 5) << 2) + 4 | 0) >>> 2;
                            k = a + 4 | 0;
                            gc(a, j + (c[k >> 2] | 0) | 0);
                            e = c[k >> 2] | 0;
                            j = j + e | 0;
                            c[k >> 2] = j;
                            if (j >>> 0 < e >>> 0) Ta(va(1) | 0, 48, 0);
                            a = (c[a >> 2] | 0) + (e << 2) | 0;
                            if (!a) { i = f; return e | 0 }
                            h = c[b >> 2] & -9 | h << 3;
                            c[a >> 2] = h;
                            if ((c[b >> 2] | 0) >>> 0 > 31) {
                                h = 0;
                                do {
                                    c[a + (h << 2) + 4 >> 2] = c[b + (h << 2) + 4 >> 2];
                                    h = h + 1 | 0
                                } while ((h | 0) < ((c[b >> 2] | 0) >>> 5 | 0));
                                h = c[a >> 2] | 0
                            }
                            if (!(h & 8)) { i = f; return e | 0 }
                            j = h >>> 5;
                            b = b + (j << 2) + 4 | 0;
                            if (!(h & 4)) {
                                c[a + (j << 2) + 4 >> 2] = c[b >> 2];
                                i = f;
                                return e | 0
                            } else {
                                g[a + (j << 2) + 4 >> 2] = +g[b >> 2];
                                i = f;
                                return e | 0
                            }
                            return 0
                        }

                        function xc(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                k = 0;
                            d = i;
                            i = i + 16 | 0;
                            g = d;
                            Gb(b);
                            c[b >> 2] = 3424;
                            c[b + 684 >> 2] = c[719];
                            c[b + 688 >> 2] = c[747];
                            c[b + 692 >> 2] = c[785];
                            h[b + 696 >> 3] = +h[411];
                            a[b + 704 >> 0] = a[2652] | 0;
                            a[b + 705 >> 0] = a[2724] | 0;
                            a[b + 706 >> 0] = a[2804] | 0;
                            a[b + 707 >> 0] = 1;
                            c[b + 708 >> 2] = 0;
                            c[b + 712 >> 2] = 0;
                            c[b + 716 >> 2] = 0;
                            c[b + 720 >> 2] = 1;
                            a[b + 724 >> 0] = 1;
                            e = b + 732 | 0;
                            k = b + 544 | 0;
                            c[b + 760 >> 2] = 0;
                            c[b + 764 >> 2] = 0;
                            c[b + 768 >> 2] = 0;
                            c[b + 776 >> 2] = 0;
                            c[b + 780 >> 2] = 0;
                            c[b + 784 >> 2] = 0;
                            c[b + 792 >> 2] = 0;
                            c[b + 796 >> 2] = 0;
                            c[b + 800 >> 2] = 0;
                            j = b + 804 | 0;
                            c[e + 0 >> 2] = 0;
                            c[e + 4 >> 2] = 0;
                            c[e + 8 >> 2] = 0;
                            c[e + 12 >> 2] = 0;
                            c[e + 16 >> 2] = 0;
                            c[e + 20 >> 2] = 0;
                            c[j >> 2] = k;
                            j = b + 808 | 0;
                            c[j >> 2] = 0;
                            c[b + 812 >> 2] = 0;
                            c[b + 816 >> 2] = 0;
                            e = b + 824 | 0;
                            c[e + 0 >> 2] = 0;
                            c[e + 4 >> 2] = 0;
                            c[e + 8 >> 2] = 0;
                            c[e + 12 >> 2] = 0;
                            c[e + 16 >> 2] = 0;
                            c[e + 20 >> 2] = 0;
                            c[b + 852 >> 2] = j;
                            Qc(b + 856 | 0, 1);
                            j = b + 868 | 0;
                            e = b + 892 | 0;
                            c[b + 920 >> 2] = 0;
                            c[b + 924 >> 2] = 0;
                            c[j + 0 >> 2] = 0;
                            c[j + 4 >> 2] = 0;
                            c[j + 8 >> 2] = 0;
                            c[j + 12 >> 2] = 0;
                            c[j + 16 >> 2] = 0;
                            c[e + 0 >> 2] = 0;
                            c[e + 4 >> 2] = 0;
                            c[e + 8 >> 2] = 0;
                            c[e + 12 >> 2] = 0;
                            c[e + 16 >> 2] = 0;
                            c[e + 20 >> 2] = 0;
                            e = g + 4 | 0;
                            c[e >> 2] = 0;
                            j = g + 8 | 0;
                            c[j >> 2] = 2;
                            f = Ud(0, 8) | 0;
                            c[g >> 2] = f;
                            if ((f | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) Ta(va(1) | 0, 48, 0);
                            c[f >> 2] = -2;
                            c[e >> 2] = 1;
                            a[b + 560 >> 0] = 1;
                            c[b + 928 >> 2] = pc(k, g, 0) | 0;
                            a[b + 536 >> 0] = 0;
                            if (!f) { i = d; return }
                            c[e >> 2] = 0;
                            Td(f);
                            c[g >> 2] = 0;
                            c[j >> 2] = 0;
                            i = d;
                            return
                        }

                        function yc(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            zc(a);
                            pd(a);
                            i = b;
                            return
                        }

                        function zc(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0,
                                e = 0;
                            b = i;
                            c[a >> 2] = 3424;
                            d = a + 904 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 908 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 912 >> 2] = 0
                            }
                            d = a + 892 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 896 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 900 >> 2] = 0
                            }
                            d = a + 876 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 880 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 884 >> 2] = 0
                            }
                            d = a + 856 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 860 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 864 >> 2] = 0
                            }
                            e = a + 836 | 0;
                            d = c[e >> 2] | 0;
                            if (d) {
                                c[a + 840 >> 2] = 0;
                                Td(d);
                                c[e >> 2] = 0;
                                c[a + 844 >> 2] = 0
                            }
                            d = a + 824 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 828 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 832 >> 2] = 0
                            }
                            d = a + 808 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 812 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 816 >> 2] = 0
                            }
                            Rc(a + 760 | 0);
                            d = a + 744 | 0;
                            e = c[d >> 2] | 0;
                            if (e) {
                                c[a + 748 >> 2] = 0;
                                Td(e);
                                c[d >> 2] = 0;
                                c[a + 752 >> 2] = 0
                            }
                            d = a + 732 | 0;
                            e = c[d >> 2] | 0;
                            if (!e) {
                                Ib(a);
                                i = b;
                                return
                            }
                            c[a + 736 >> 2] = 0;
                            Td(e);
                            c[d >> 2] = 0;
                            c[a + 740 >> 2] = 0;
                            Ib(a);
                            i = b;
                            return
                        }

                        function Ac(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0;
                            f = i;
                            i = i + 32 | 0;
                            h = f + 12 | 0;
                            k = f + 8 | 0;
                            l = f + 16 | 0;
                            g = f + 4 | 0;
                            j = f;
                            a[l >> 0] = a[d >> 0] | 0;
                            a[h + 0 >> 0] = a[l + 0 >> 0] | 0;
                            e = Jb(b, h, e) | 0;
                            c[k >> 2] = e;
                            kc(b + 876 | 0, e, 0);
                            kc(b + 904 | 0, e, 0);
                            if (!(a[b + 724 >> 0] | 0)) { i = f; return e | 0 }
                            l = b + 808 | 0;
                            d = e << 1;
                            c[g >> 2] = d;
                            c[h + 0 >> 2] = c[g + 0 >> 2];
                            Sc(l, h, 0);
                            c[j >> 2] = d | 1;
                            c[h + 0 >> 2] = c[j + 0 >> 2];
                            Sc(l, h, 0);
                            Tc(b + 760 | 0, k);
                            kc(b + 744 | 0, e, 0);
                            Uc(b + 824 | 0, e);
                            i = f;
                            return e | 0
                        }

                        function Bc(b, e, f, g) {
                            b = b | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            var h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0;
                            k = i;
                            i = i + 32 | 0;
                            h = k + 4 | 0;
                            r = k;
                            p = k + 16 | 0;
                            c[h >> 2] = 0;
                            j = h + 4 | 0;
                            c[j >> 2] = 0;
                            l = h + 8 | 0;
                            c[l >> 2] = 0;
                            s = a[2608] | 0;
                            a[b >> 0] = s;
                            m = e + 724 | 0;
                            f = (d[m >> 0] & (f & 1) | 0) != 0;
                            if (f) {
                                u = e + 308 | 0;
                                x = c[u >> 2] | 0;
                                if ((x | 0) > 0) {
                                    t = e + 304 | 0;
                                    s = e + 876 | 0;
                                    v = 0;
                                    do {
                                        w = c[(c[t >> 2] | 0) + (v << 2) >> 2] >> 1;
                                        c[r >> 2] = w;
                                        w = (c[s >> 2] | 0) + w | 0;
                                        if (!(a[w >> 0] | 0)) {
                                            a[w >> 0] = 1;
                                            nc(h, r);
                                            x = c[u >> 2] | 0
                                        }
                                        v = v + 1 | 0
                                    } while ((v | 0) < (x | 0))
                                }
                                r = (Cc(e, g) | 0) & 1 ^ 1;
                                a[b >> 0] = r;
                                g = a[2608] | 0
                            } else {
                                g = s;
                                r = s
                            }
                            x = g & 255;
                            if (!((x >>> 1 ^ 1) & r << 24 >> 24 == g << 24 >> 24 | x & 2 & (r & 255))) { if ((c[e + 44 >> 2] | 0) > 0) Ka(3760) | 0 } else {
                                $b(p, e);
                                r = a[p >> 0] | 0;
                                a[b >> 0] = r
                            }
                            w = a[2608] | 0;
                            x = w & 255;
                            if ((((x >>> 1 ^ 1) & r << 24 >> 24 == w << 24 >> 24 | x & 2 & (r & 255) | 0) != 0 ? (a[e + 707 >> 0] | 0) != 0 : 0) ? (q = (c[e + 736 >> 2] | 0) + -1 | 0, (q | 0) > 0) : 0) {
                                b = e + 732 | 0;
                                p = e + 4 | 0;
                                do {
                                    g = c[b >> 2] | 0;
                                    u = c[g + (q << 2) >> 2] | 0;
                                    v = q + -1 | 0;
                                    w = c[g + (v << 2) >> 2] | 0;
                                    q = c[p >> 2] | 0;
                                    a: do {
                                        if ((u | 0) > 1) {
                                            s = a[2616] | 0;
                                            r = s & 255;
                                            t = r & 2;
                                            r = r >>> 1 ^ 1;
                                            x = v;
                                            while (1) {
                                                w = d[q + (w >> 1) >> 0] ^ w & 1;
                                                v = u + -1 | 0;
                                                if (!((w & 255) << 24 >> 24 == s << 24 >> 24 & r | t & w)) break a;
                                                u = x + -1 | 0;
                                                w = c[g + (u << 2) >> 2] | 0;
                                                if ((v | 0) > 1) {
                                                    x = u;
                                                    u = v
                                                } else {
                                                    x = u;
                                                    u = v;
                                                    o = 20;
                                                    break
                                                }
                                            }
                                        } else {
                                            x = v;
                                            o = 20
                                        }
                                    } while (0);
                                    if ((o | 0) == 20) {
                                        o = 0;
                                        a[q + (w >> 1) >> 0] = (w & 1 ^ 1) & 255 ^ 1
                                    }
                                    q = x - u | 0
                                } while ((q | 0) > 0)
                            }
                            if (f ? (n = c[j >> 2] | 0, (n | 0) > 0) : 0) {
                                o = c[h >> 2] | 0;
                                f = e + 876 | 0;
                                p = 0;
                                do {
                                    b = c[o + (p << 2) >> 2] | 0;
                                    a[(c[f >> 2] | 0) + b >> 0] = 0;
                                    if (a[m >> 0] | 0) Vc(e, b);
                                    p = p + 1 | 0
                                } while ((p | 0) < (n | 0))
                            }
                            e = c[h >> 2] | 0;
                            if (!e) { i = k; return }
                            c[j >> 2] = 0;
                            Td(e);
                            c[h >> 2] = 0;
                            c[l >> 2] = 0;
                            i = k;
                            return
                        }

                        function Cc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                j = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0,
                                A = 0,
                                B = 0,
                                C = 0,
                                D = 0,
                                E = 0,
                                F = 0,
                                G = 0,
                                H = 0,
                                I = 0,
                                J = 0;
                            m = i;
                            i = i + 16 | 0;
                            j = m;
                            if (!(Zb(b) | 0)) {
                                H = 0;
                                i = m;
                                return H | 0
                            }
                            l = b + 724 | 0;
                            if (!(a[l >> 0] | 0)) {
                                H = 1;
                                i = m;
                                return H | 0
                            }
                            x = b + 924 | 0;
                            v = b + 872 | 0;
                            w = b + 868 | 0;
                            u = b + 860 | 0;
                            r = b + 680 | 0;
                            y = b + 824 | 0;
                            g = b + 828 | 0;
                            o = b + 836 | 0;
                            z = b + 904 | 0;
                            A = b + 332 | 0;
                            e = b + 44 | 0;
                            B = b + 704 | 0;
                            D = b + 706 | 0;
                            E = b + 696 | 0;
                            p = b + 556 | 0;
                            q = b + 548 | 0;
                            C = b + 876 | 0;
                            s = b + 920 | 0;
                            t = b + 284 | 0;
                            a: while (1) {
                                if (((c[x >> 2] | 0) <= 0 ? (c[s >> 2] | 0) >= (c[t >> 2] | 0) : 0) ? (c[g >> 2] | 0) <= 0 : 0) break;
                                Ic(b);
                                G = c[v >> 2] | 0;
                                H = c[w >> 2] | 0;
                                F = G - H | 0;
                                if ((G | 0) < (H | 0)) F = (c[u >> 2] | 0) + F | 0;
                                if (!((F | 0) <= 0 ? (c[s >> 2] | 0) >= (c[t >> 2] | 0) : 0)) n = 11;
                                if ((n | 0) == 11 ? (n = 0, !(Jc(b, 1) | 0)) : 0) { n = 12; break }
                                H = c[g >> 2] | 0;
                                if (a[r >> 0] | 0) { n = 15; break }
                                if (!H) continue;
                                else F = 0;
                                while (1) {
                                    J = c[y >> 2] | 0;
                                    G = c[J >> 2] | 0;
                                    I = c[J + (H + -1 << 2) >> 2] | 0;
                                    c[J >> 2] = I;
                                    H = c[o >> 2] | 0;
                                    c[H + (I << 2) >> 2] = 0;
                                    c[H + (G << 2) >> 2] = -1;
                                    H = (c[g >> 2] | 0) + -1 | 0;
                                    c[g >> 2] = H;
                                    if ((H | 0) > 1) Wc(y, 0);
                                    if (a[r >> 0] | 0) continue a;
                                    if ((a[(c[z >> 2] | 0) + G >> 0] | 0) == 0 ? (I = a[(c[A >> 2] | 0) + G >> 0] | 0, H = a[2624] | 0, J = H & 255, ((J >>> 1 ^ 1) & I << 24 >> 24 == H << 24 >> 24 | I & 2 & J | 0) != 0) : 0) {
                                        if ((c[e >> 2] | 0) > 1 & ((F | 0) % 100 | 0 | 0) == 0) {
                                            c[j >> 2] = c[g >> 2];
                                            La(3504, j | 0) | 0
                                        }
                                        if (a[B >> 0] | 0) {
                                            J = (c[C >> 2] | 0) + G | 0;
                                            H = a[J >> 0] | 0;
                                            a[J >> 0] = 1;
                                            if (!(Lc(b, G) | 0)) { n = 29; break a }
                                            a[(c[C >> 2] | 0) + G >> 0] = H << 24 >> 24 != 0 & 1
                                        }
                                        if ((((a[D >> 0] | 0) != 0 ? (I = a[(c[A >> 2] | 0) + G >> 0] | 0, H = a[2624] | 0, J = H & 255, ((J >>> 1 ^ 1) & I << 24 >> 24 == H << 24 >> 24 | I & 2 & J | 0) != 0) : 0) ? (a[(c[C >> 2] | 0) + G >> 0] | 0) == 0 : 0) ? !(Mc(b, G) | 0) : 0) { n = 35; break a }
                                        if (+((c[p >> 2] | 0) >>> 0) > +h[E >> 3] * +((c[q >> 2] | 0) >>> 0)) gb[c[(c[b >> 2] | 0) + 8 >> 2] & 31](b)
                                    }
                                    H = c[g >> 2] | 0;
                                    if (!H) continue a;
                                    else F = F + 1 | 0
                                }
                            }
                            do {
                                if ((n | 0) == 12) a[b + 492 >> 0] = 0;
                                else if ((n | 0) == 15) {
                                    r = c[b + 824 >> 2] | 0;
                                    if ((H | 0) <= 0) { if (!r) break } else {
                                        t = c[o >> 2] | 0;
                                        s = 0;
                                        do {
                                            c[t + (c[r + (s << 2) >> 2] << 2) >> 2] = -1;
                                            s = s + 1 | 0
                                        } while ((s | 0) < (c[g >> 2] | 0))
                                    }
                                    c[g >> 2] = 0
                                } else if ((n | 0) == 29) a[b + 492 >> 0] = 0;
                                else if ((n | 0) == 35) a[b + 492 >> 0] = 0
                            } while (0);
                            if (!d) { if (+((c[p >> 2] | 0) >>> 0) > +h[b + 96 >> 3] * +((c[q >> 2] | 0) >>> 0)) gb[c[(c[b >> 2] | 0) + 8 >> 2] & 31](b) } else {
                                d = b + 744 | 0;
                                p = c[d >> 2] | 0;
                                if (p) {
                                    c[b + 748 >> 2] = 0;
                                    Td(p);
                                    c[d >> 2] = 0;
                                    c[b + 752 >> 2] = 0
                                }
                                Xc(b + 760 | 0, 1);
                                d = b + 808 | 0;
                                p = c[d >> 2] | 0;
                                if (p) {
                                    c[b + 812 >> 2] = 0;
                                    Td(p);
                                    c[d >> 2] = 0;
                                    c[b + 816 >> 2] = 0
                                }
                                p = b + 824 | 0;
                                d = c[p >> 2] | 0;
                                if ((c[g >> 2] | 0) <= 0) { if (d) n = 48 } else {
                                    n = c[o >> 2] | 0;
                                    o = 0;
                                    do {
                                        c[n + (c[d + (o << 2) >> 2] << 2) >> 2] = -1;
                                        o = o + 1 | 0
                                    } while ((o | 0) < (c[g >> 2] | 0));
                                    n = 48
                                }
                                if ((n | 0) == 48) {
                                    c[g >> 2] = 0;
                                    Td(d);
                                    c[p >> 2] = 0;
                                    c[b + 832 >> 2] = 0
                                }
                                Yc(b + 856 | 0, 1);
                                a[l >> 0] = 0;
                                a[b + 536 >> 0] = 1;
                                a[b + 560 >> 0] = 0;
                                c[b + 728 >> 2] = c[b + 540 >> 2];
                                Yb(b);
                                gb[c[(c[b >> 2] | 0) + 8 >> 2] & 31](b)
                            }
                            if ((c[e >> 2] | 0) > 0 ? (f = c[b + 736 >> 2] | 0, (f | 0) > 0) : 0) {
                                h[k >> 3] = +(f << 2 >>> 0) * 9.5367431640625e-7;
                                c[j >> 2] = c[k >> 2];
                                c[j + 4 >> 2] = c[k + 4 >> 2];
                                La(3528, j | 0) | 0
                            }
                            J = (a[b + 492 >> 0] | 0) != 0;
                            i = m;
                            return J | 0
                        }

                        function Dc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0;
                            e = i;
                            i = i + 16 | 0;
                            g = e;
                            j = b + 256 | 0;
                            k = b + 260 | 0;
                            h = c[k >> 2] | 0;
                            if ((a[b + 705 >> 0] | 0) != 0 ? Ec(b, d) | 0 : 0) {
                                p = 1;
                                i = e;
                                return p | 0
                            }
                            if (!(Kb(b, d) | 0)) {
                                p = 0;
                                i = e;
                                return p | 0
                            }
                            if (!(a[b + 724 >> 0] | 0)) {
                                p = 1;
                                i = e;
                                return p | 0
                            }
                            d = c[k >> 2] | 0;
                            if ((d | 0) != (h + 1 | 0)) {
                                p = 1;
                                i = e;
                                return p | 0
                            }
                            p = c[(c[j >> 2] | 0) + (d + -1 << 2) >> 2] | 0;
                            c[g >> 2] = p;
                            m = (c[b + 544 >> 2] | 0) + (p << 2) | 0;
                            Zc(b + 856 | 0, p);
                            if ((c[m >> 2] | 0) >>> 0 <= 31) {
                                p = 1;
                                i = e;
                                return p | 0
                            }
                            l = b + 760 | 0;
                            k = b + 808 | 0;
                            j = b + 744 | 0;
                            h = b + 924 | 0;
                            d = b + 824 | 0;
                            n = b + 840 | 0;
                            b = b + 836 | 0;
                            o = 0;
                            do {
                                p = m + (o << 2) + 4 | 0;
                                _c((c[l >> 2] | 0) + ((c[p >> 2] >> 1) * 12 | 0) | 0, g);
                                q = (c[k >> 2] | 0) + (c[p >> 2] << 2) | 0;
                                c[q >> 2] = (c[q >> 2] | 0) + 1;
                                a[(c[j >> 2] | 0) + (c[p >> 2] >> 1) >> 0] = 1;
                                c[h >> 2] = (c[h >> 2] | 0) + 1;
                                p = c[p >> 2] >> 1;
                                if ((c[n >> 2] | 0) > (p | 0) ? (f = c[(c[b >> 2] | 0) + (p << 2) >> 2] | 0, (f | 0) > -1) : 0) Wc(d, f);
                                o = o + 1 | 0
                            } while ((o | 0) < ((c[m >> 2] | 0) >>> 5 | 0));
                            f = 1;
                            i = e;
                            return f | 0
                        }

                        function Ec(b, e) {
                            b = b | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0;
                            k = i;
                            i = i + 16 | 0;
                            h = k + 8 | 0;
                            j = k + 4 | 0;
                            g = k;
                            c[j >> 2] = c[b + 284 >> 2];
                            nc(b + 292 | 0, j);
                            j = e + 4 | 0;
                            m = c[j >> 2] | 0;
                            a: do {
                                if ((m | 0) > 0) {
                                    f = b + 332 | 0;
                                    l = 0;
                                    while (1) {
                                        n = c[(c[e >> 2] | 0) + (l << 2) >> 2] | 0;
                                        p = d[(c[f >> 2] | 0) + (n >> 1) >> 0] | 0;
                                        q = p ^ n & 1;
                                        o = q & 255;
                                        s = a[2608] | 0;
                                        r = s & 255;
                                        if (o << 24 >> 24 == s << 24 >> 24 & (r >>> 1 ^ 1) | r & 2 & q) break;
                                        r = a[2616] | 0;
                                        s = r & 255;
                                        if (!((s >>> 1 ^ 1) & o << 24 >> 24 == r << 24 >> 24 | p & 2 & s)) {
                                            c[g >> 2] = n ^ 1;
                                            c[h + 0 >> 2] = c[g + 0 >> 2];
                                            Lb(b, h, -1);
                                            m = c[j >> 2] | 0
                                        }
                                        l = l + 1 | 0;
                                        if ((l | 0) >= (m | 0)) break a
                                    }
                                    Rb(b, 0);
                                    s = 1;
                                    i = k;
                                    return s | 0
                                }
                            } while (0);
                            s = (Mb(b) | 0) != -1;
                            Rb(b, 0);
                            i = k;
                            return s | 0
                        }

                        function Fc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0;
                            e = i;
                            i = i + 16 | 0;
                            g = e;
                            f = (c[b + 544 >> 2] | 0) + (d << 2) | 0;
                            if (!(a[b + 724 >> 0] | 0)) {
                                Pb(b, d);
                                i = e;
                                return
                            }
                            if ((c[f >> 2] | 0) >>> 0 <= 31) {
                                Pb(b, d);
                                i = e;
                                return
                            }
                            j = b + 808 | 0;
                            k = b + 776 | 0;
                            h = b + 792 | 0;
                            l = 0;
                            do {
                                m = f + (l << 2) + 4 | 0;
                                n = (c[j >> 2] | 0) + (c[m >> 2] << 2) | 0;
                                c[n >> 2] = (c[n >> 2] | 0) + -1;
                                Vc(b, c[m >> 2] >> 1);
                                m = c[m >> 2] >> 1;
                                c[g >> 2] = m;
                                m = (c[k >> 2] | 0) + m | 0;
                                if (!(a[m >> 0] | 0)) {
                                    a[m >> 0] = 1;
                                    nc(h, g)
                                }
                                l = l + 1 | 0
                            } while ((l | 0) < ((c[f >> 2] | 0) >>> 5 | 0));
                            Pb(b, d);
                            i = e;
                            return
                        }

                        function Gc(b, e, f) {
                            b = b | 0;
                            e = e | 0;
                            f = f | 0;
                            var g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0;
                            g = i;
                            i = i + 16 | 0;
                            j = g + 4 | 0;
                            h = g;
                            l = c[b + 544 >> 2] | 0;
                            k = l + (e << 2) | 0;
                            Zc(b + 856 | 0, e);
                            if ((c[k >> 2] & -32 | 0) == 64) {
                                Fc(b, e);
                                p = c[f >> 2] | 0;
                                f = c[k >> 2] | 0;
                                a: do {
                                    if (f >>> 0 > 31) {
                                        m = f >>> 5;
                                        n = 0;
                                        while (1) {
                                            o = n + 1 | 0;
                                            if ((c[k + (n << 2) + 4 >> 2] | 0) == (p | 0)) { o = n; break a }
                                            if ((o | 0) < (m | 0)) n = o;
                                            else break
                                        }
                                    } else {
                                        m = 0;
                                        o = 0
                                    }
                                } while (0);
                                n = m + -1 | 0;
                                if ((o | 0) < (n | 0))
                                    do {
                                        f = o;
                                        o = o + 1 | 0;
                                        c[k + (f << 2) + 4 >> 2] = c[k + (o << 2) + 4 >> 2];
                                        f = c[k >> 2] | 0;
                                        m = f >>> 5;
                                        n = m + -1 | 0
                                    } while ((o | 0) < (n | 0));
                                if (f & 8) {
                                    c[k + (n << 2) + 4 >> 2] = c[k + (m << 2) + 4 >> 2];
                                    f = c[k >> 2] | 0
                                }
                                m = f + -32 | 0;
                                c[k >> 2] = m;
                                m = m >>> 5;
                                if (!m) {
                                    m = 0;
                                    f = 0
                                } else {
                                    f = 0;
                                    n = 0;
                                    do {
                                        f = 1 << ((c[k + (n << 2) + 4 >> 2] | 0) >>> 1 & 31) | f;
                                        n = n + 1 | 0
                                    } while ((n | 0) < (m | 0))
                                }
                                c[k + (m << 2) + 4 >> 2] = f
                            } else {
                                Ob(b, e, 1);
                                f = c[f >> 2] | 0;
                                n = c[k >> 2] | 0;
                                b: do {
                                    if (n >>> 0 > 31) {
                                        m = n >>> 5;
                                        o = 0;
                                        while (1) {
                                            p = o + 1 | 0;
                                            if ((c[k + (o << 2) + 4 >> 2] | 0) == (f | 0)) { p = o; break b }
                                            if ((p | 0) < (m | 0)) o = p;
                                            else break
                                        }
                                    } else {
                                        m = 0;
                                        p = 0
                                    }
                                } while (0);
                                o = m + -1 | 0;
                                if ((p | 0) < (o | 0))
                                    do {
                                        n = p;
                                        p = p + 1 | 0;
                                        c[k + (n << 2) + 4 >> 2] = c[k + (p << 2) + 4 >> 2];
                                        n = c[k >> 2] | 0;
                                        m = n >>> 5;
                                        o = m + -1 | 0
                                    } while ((p | 0) < (o | 0));
                                if (n & 8) {
                                    c[k + (o << 2) + 4 >> 2] = c[k + (m << 2) + 4 >> 2];
                                    n = c[k >> 2] | 0
                                }
                                o = n + -32 | 0;
                                c[k >> 2] = o;
                                o = o >>> 5;
                                if (!o) {
                                    o = 0;
                                    m = 0
                                } else {
                                    m = 0;
                                    n = 0;
                                    do {
                                        m = 1 << ((c[k + (n << 2) + 4 >> 2] | 0) >>> 1 & 31) | m;
                                        n = n + 1 | 0
                                    } while ((n | 0) < (o | 0))
                                }
                                c[k + (o << 2) + 4 >> 2] = m;
                                Nb(b, e);
                                m = f >> 1;
                                n = c[b + 760 >> 2] | 0;
                                o = n + (m * 12 | 0) | 0;
                                n = n + (m * 12 | 0) + 4 | 0;
                                p = c[n >> 2] | 0;
                                c: do {
                                    if ((p | 0) > 0) {
                                        s = c[o >> 2] | 0;
                                        q = 0;
                                        while (1) {
                                            r = q + 1 | 0;
                                            if ((c[s + (q << 2) >> 2] | 0) == (e | 0)) break c;
                                            if ((r | 0) < (p | 0)) q = r;
                                            else { q = r; break }
                                        }
                                    } else q = 0
                                } while (0);
                                p = p + -1 | 0;
                                if ((q | 0) < (p | 0)) {
                                    o = c[o >> 2] | 0;
                                    do {
                                        p = q;
                                        q = q + 1 | 0;
                                        c[o + (p << 2) >> 2] = c[o + (q << 2) >> 2];
                                        p = (c[n >> 2] | 0) + -1 | 0
                                    } while ((q | 0) < (p | 0))
                                }
                                c[n >> 2] = p;
                                s = (c[b + 808 >> 2] | 0) + (f << 2) | 0;
                                c[s >> 2] = (c[s >> 2] | 0) + -1;
                                Vc(b, m)
                            }
                            if ((c[k >> 2] & -32 | 0) != 32) {
                                s = 1;
                                i = g;
                                return s | 0
                            }
                            l = c[l + (e + 1 << 2) >> 2] | 0;
                            k = d[(c[b + 332 >> 2] | 0) + (l >> 1) >> 0] | 0;
                            s = k ^ l & 1;
                            e = s & 255;
                            q = a[2624] | 0;
                            r = q & 255;
                            if (!(e << 24 >> 24 == q << 24 >> 24 & (r >>> 1 ^ 1) | r & 2 & s)) {
                                r = a[2616] | 0;
                                s = r & 255;
                                if ((s >>> 1 ^ 1) & e << 24 >> 24 == r << 24 >> 24 | k & 2 & s) {
                                    s = 0;
                                    i = g;
                                    return s | 0
                                }
                            } else {
                                c[h >> 2] = l;
                                c[j + 0 >> 2] = c[h + 0 >> 2];
                                Lb(b, j, -1)
                            }
                            s = (Mb(b) | 0) == -1;
                            i = g;
                            return s | 0
                        }

                        function Hc(a, b, d, e, f) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            var g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0;
                            g = i;
                            i = i + 16 | 0;
                            j = g + 4 | 0;
                            h = g;
                            o = a + 708 | 0;
                            c[o >> 2] = (c[o >> 2] | 0) + 1;
                            if (c[f >> 2] | 0) c[f + 4 >> 2] = 0;
                            k = (c[b >> 2] | 0) >>> 5 >>> 0 < (c[d >> 2] | 0) >>> 5 >>> 0;
                            a = k ? d : b;
                            b = k ? b : d;
                            k = c[b >> 2] | 0;
                            a: do {
                                if (k >>> 0 > 31) {
                                    d = 0;
                                    b: while (1) {
                                        l = c[b + (d << 2) + 4 >> 2] | 0;
                                        c: do {
                                            if ((l >> 1 | 0) != (e | 0)) {
                                                m = c[a >> 2] | 0;
                                                d: do {
                                                    if (m >>> 0 > 31) {
                                                        n = 0;
                                                        while (1) {
                                                            o = c[a + (n << 2) + 4 >> 2] | 0;
                                                            n = n + 1 | 0;
                                                            if ((l ^ o) >>> 0 < 2) break;
                                                            if ((n | 0) >= (m >>> 5 | 0)) break d
                                                        }
                                                        if ((o | 0) == (l ^ 1 | 0)) { f = 0; break b } else break c
                                                    }
                                                } while (0);
                                                c[j >> 2] = l;
                                                mc(f, j);
                                                k = c[b >> 2] | 0
                                            }
                                        } while (0);
                                        d = d + 1 | 0;
                                        if ((d | 0) >= (k >>> 5 | 0)) break a
                                    }
                                    i = g;
                                    return f | 0
                                }
                            } while (0);
                            d = c[a >> 2] | 0;
                            if (d >>> 0 <= 31) {
                                o = 1;
                                i = g;
                                return o | 0
                            }
                            j = 0;
                            do {
                                b = c[a + (j << 2) + 4 >> 2] | 0;
                                if ((b >> 1 | 0) != (e | 0)) {
                                    c[h >> 2] = b;
                                    mc(f, h);
                                    d = c[a >> 2] | 0
                                }
                                j = j + 1 | 0
                            } while ((j | 0) < (d >>> 5 | 0));
                            f = 1;
                            i = g;
                            return f | 0
                        }

                        function Ic(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0;
                            d = i;
                            k = b + 924 | 0;
                            if (!(c[k >> 2] | 0)) { i = d; return }
                            h = b + 856 | 0;
                            e = b + 872 | 0;
                            f = b + 868 | 0;
                            j = b + 860 | 0;
                            g = b + 544 | 0;
                            l = 0;
                            while (1) {
                                w = c[e >> 2] | 0;
                                m = c[f >> 2] | 0;
                                n = w - m | 0;
                                if ((w | 0) < (m | 0)) n = (c[j >> 2] | 0) + n | 0;
                                if ((l | 0) >= (n | 0)) break;
                                n = (c[g >> 2] | 0) + (c[(c[h >> 2] | 0) + (((m + l | 0) % (c[j >> 2] | 0) | 0) << 2) >> 2] << 2) | 0;
                                m = c[n >> 2] | 0;
                                if (!(m & 3)) c[n >> 2] = m & -4 | 2;
                                l = l + 1 | 0
                            }
                            l = b + 540 | 0;
                            q = c[l >> 2] | 0;
                            if ((q | 0) > 0) {
                                n = b + 744 | 0;
                                o = b + 776 | 0;
                                m = b + 760 | 0;
                                b = b + 804 | 0;
                                p = 0;
                                do {
                                    if (a[(c[n >> 2] | 0) + p >> 0] | 0) {
                                        r = (c[o >> 2] | 0) + p | 0;
                                        if (a[r >> 0] | 0) {
                                            s = c[m >> 2] | 0;
                                            q = s + (p * 12 | 0) + 4 | 0;
                                            u = c[q >> 2] | 0;
                                            if ((u | 0) > 0) {
                                                s = c[s + (p * 12 | 0) >> 2] | 0;
                                                v = 0;
                                                t = 0;
                                                do {
                                                    w = c[s + (v << 2) >> 2] | 0;
                                                    if ((c[(c[c[b >> 2] >> 2] | 0) + (w << 2) >> 2] & 3 | 0) != 1) {
                                                        c[s + (t << 2) >> 2] = w;
                                                        u = c[q >> 2] | 0;
                                                        t = t + 1 | 0
                                                    }
                                                    v = v + 1 | 0
                                                } while ((v | 0) < (u | 0))
                                            } else {
                                                v = 0;
                                                t = 0
                                            }
                                            s = v - t | 0;
                                            if ((s | 0) > 0) c[q >> 2] = u - s;
                                            a[r >> 0] = 0
                                        }
                                        r = c[m >> 2] | 0;
                                        q = r + (p * 12 | 0) + 4 | 0;
                                        t = c[q >> 2] | 0;
                                        if ((t | 0) > 0) {
                                            r = r + (p * 12 | 0) | 0;
                                            s = 0;
                                            do {
                                                u = c[(c[r >> 2] | 0) + (s << 2) >> 2] | 0;
                                                if (!(c[(c[g >> 2] | 0) + (u << 2) >> 2] & 3)) {
                                                    Zc(h, u);
                                                    t = (c[g >> 2] | 0) + (c[(c[r >> 2] | 0) + (s << 2) >> 2] << 2) | 0;
                                                    c[t >> 2] = c[t >> 2] & -4 | 2;
                                                    t = c[q >> 2] | 0
                                                }
                                                s = s + 1 | 0
                                            } while ((s | 0) < (t | 0))
                                        }
                                        a[(c[n >> 2] | 0) + p >> 0] = 0;
                                        q = c[l >> 2] | 0
                                    }
                                    p = p + 1 | 0
                                } while ((p | 0) < (q | 0));
                                l = 0
                            } else l = 0;
                            while (1) {
                                w = c[e >> 2] | 0;
                                m = c[f >> 2] | 0;
                                n = w - m | 0;
                                if ((w | 0) < (m | 0)) n = (c[j >> 2] | 0) + n | 0;
                                if ((l | 0) >= (n | 0)) break;
                                m = (c[g >> 2] | 0) + (c[(c[h >> 2] | 0) + (((m + l | 0) % (c[j >> 2] | 0) | 0) << 2) >> 2] << 2) | 0;
                                n = c[m >> 2] | 0;
                                if ((n & 3 | 0) == 2) c[m >> 2] = n & -4;
                                l = l + 1 | 0
                            }
                            c[k >> 2] = 0;
                            i = d;
                            return
                        }

                        function Jc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0,
                                A = 0,
                                B = 0,
                                C = 0,
                                D = 0,
                                E = 0,
                                F = 0,
                                G = 0,
                                H = 0,
                                I = 0,
                                J = 0,
                                K = 0,
                                L = 0,
                                M = 0,
                                N = 0,
                                O = 0,
                                P = 0;
                            e = i;
                            i = i + 16 | 0;
                            m = e;
                            x = e + 12 | 0;
                            g = b + 856 | 0;
                            l = b + 872 | 0;
                            q = b + 868 | 0;
                            j = b + 860 | 0;
                            u = b + 680 | 0;
                            f = b + 920 | 0;
                            h = b + 284 | 0;
                            t = b + 280 | 0;
                            r = b + 544 | 0;
                            s = b + 928 | 0;
                            o = b + 44 | 0;
                            n = b + 776 | 0;
                            v = b + 692 | 0;
                            p = b + 804 | 0;
                            k = b + 760 | 0;
                            C = 0;
                            F = 0;
                            D = 0;
                            a: while (1) {
                                E = c[q >> 2] | 0;
                                do {
                                    A = c[l >> 2] | 0;
                                    B = (A | 0) < (E | 0);
                                    A = A - E | 0;
                                    if (B) G = (c[j >> 2] | 0) + A | 0;
                                    else G = A;
                                    if ((G | 0) <= 0 ? (c[f >> 2] | 0) >= (c[h >> 2] | 0) : 0) {
                                        f = 1;
                                        j = 53;
                                        break a
                                    }
                                    if (a[u >> 0] | 0) { j = 8; break a }
                                    if (B) A = (c[j >> 2] | 0) + A | 0;
                                    if ((A | 0) == 0 ? (z = c[f >> 2] | 0, (z | 0) < (c[h >> 2] | 0)) : 0) {
                                        c[f >> 2] = z + 1;
                                        c[(c[r >> 2] | 0) + ((c[s >> 2] | 0) + 1 << 2) >> 2] = c[(c[t >> 2] | 0) + (z << 2) >> 2];
                                        A = (c[r >> 2] | 0) + (c[s >> 2] << 2) | 0;
                                        B = (c[A >> 2] | 0) >>> 5;
                                        if (!B) {
                                            B = 0;
                                            G = 0
                                        } else {
                                            G = 0;
                                            E = 0;
                                            do {
                                                G = 1 << ((c[A + (E << 2) + 4 >> 2] | 0) >>> 1 & 31) | G;
                                                E = E + 1 | 0
                                            } while ((E | 0) < (B | 0))
                                        }
                                        c[A + (B << 2) + 4 >> 2] = G;
                                        Zc(g, c[s >> 2] | 0);
                                        E = c[q >> 2] | 0
                                    }
                                    A = c[(c[g >> 2] | 0) + (E << 2) >> 2] | 0;
                                    E = E + 1 | 0;
                                    J = c[j >> 2] | 0;
                                    E = (E | 0) == (J | 0) ? 0 : E;
                                    c[q >> 2] = E;
                                    G = c[r >> 2] | 0;
                                    B = G + (A << 2) | 0;
                                    I = c[B >> 2] | 0
                                } while ((I & 3 | 0) != 0);
                                if (d ? (c[o >> 2] | 0) > 1 : 0) {
                                    H = C + 1 | 0;
                                    if (!((C | 0) % 1e3 | 0)) {
                                        I = c[l >> 2] | 0;
                                        c[m >> 2] = I - E + ((I | 0) < (E | 0) ? J : 0);
                                        c[m + 4 >> 2] = D;
                                        c[m + 8 >> 2] = F;
                                        La(3440, m | 0) | 0;
                                        I = c[B >> 2] | 0;
                                        C = H
                                    } else C = H
                                }
                                E = G + (A + 1 << 2) | 0;
                                G = c[E >> 2] >> 1;
                                if (I >>> 0 > 63) {
                                    H = c[k >> 2] | 0;
                                    I = I >>> 5;
                                    J = 1;
                                    do {
                                        P = c[B + (J << 2) + 4 >> 2] >> 1;
                                        G = (c[H + (P * 12 | 0) + 4 >> 2] | 0) < (c[H + (G * 12 | 0) + 4 >> 2] | 0) ? P : G;
                                        J = J + 1 | 0
                                    } while ((J | 0) < (I | 0))
                                }
                                I = (c[n >> 2] | 0) + G | 0;
                                if (a[I >> 0] | 0) {
                                    J = c[k >> 2] | 0;
                                    H = J + (G * 12 | 0) + 4 | 0;
                                    M = c[H >> 2] | 0;
                                    if ((M | 0) > 0) {
                                        J = c[J + (G * 12 | 0) >> 2] | 0;
                                        L = 0;
                                        K = 0;
                                        do {
                                            N = c[J + (L << 2) >> 2] | 0;
                                            if ((c[(c[c[p >> 2] >> 2] | 0) + (N << 2) >> 2] & 3 | 0) != 1) {
                                                c[J + (K << 2) >> 2] = N;
                                                M = c[H >> 2] | 0;
                                                K = K + 1 | 0
                                            }
                                            L = L + 1 | 0
                                        } while ((L | 0) < (M | 0))
                                    } else {
                                        L = 0;
                                        K = 0
                                    }
                                    J = L - K | 0;
                                    if ((J | 0) > 0) c[H >> 2] = M - J;
                                    a[I >> 0] = 0
                                }
                                I = c[k >> 2] | 0;
                                H = c[I + (G * 12 | 0) >> 2] | 0;
                                I = I + (G * 12 | 0) + 4 | 0;
                                if ((c[I >> 2] | 0) > 0) J = 0;
                                else continue;
                                while (1) {
                                    N = c[B >> 2] | 0;
                                    if (N & 3) continue a;
                                    K = c[H + (J << 2) >> 2] | 0;
                                    L = c[r >> 2] | 0;
                                    O = L + (K << 2) | 0;
                                    M = c[O >> 2] | 0;
                                    b: do {
                                        if (((!((M & 3 | 0) != 0 | (K | 0) == (A | 0)) ? (P = c[v >> 2] | 0, y = M >>> 5, (P | 0) == -1 | (y | 0) < (P | 0)) : 0) ? (w = N >>> 5, y >>> 0 >= w >>> 0) : 0) ? (c[B + (w << 2) + 4 >> 2] & ~c[O + (y << 2) + 4 >> 2] | 0) == 0 : 0) {
                                            L = L + (K + 1 << 2) | 0;
                                            do {
                                                if (N >>> 0 > 31) {
                                                    if (M >>> 0 > 31) {
                                                        O = -2;
                                                        M = 0
                                                    } else break b;
                                                    while (1) {
                                                        N = c[E + (M << 2) >> 2] | 0;
                                                        c: do {
                                                            if ((O | 0) == -2) {
                                                                P = 0;
                                                                while (1) {
                                                                    O = c[L + (P << 2) >> 2] | 0;
                                                                    if ((N | 0) == (O | 0)) { N = -2; break c }
                                                                    P = P + 1 | 0;
                                                                    if ((N | 0) == (O ^ 1 | 0)) break c;
                                                                    if (P >>> 0 >= y >>> 0) break b
                                                                }
                                                            } else {
                                                                P = 0;
                                                                while (1) {
                                                                    if ((N | 0) == (c[L + (P << 2) >> 2] | 0)) { N = O; break c }
                                                                    P = P + 1 | 0;
                                                                    if (P >>> 0 >= y >>> 0) break b
                                                                }
                                                            }
                                                        } while (0);
                                                        M = M + 1 | 0;
                                                        if (M >>> 0 >= w >>> 0) break;
                                                        else O = N
                                                    }
                                                    if ((N | 0) == -2) break;
                                                    else if ((N | 0) == -1) break b;
                                                    c[x >> 2] = N ^ 1;
                                                    c[m + 0 >> 2] = c[x + 0 >> 2];
                                                    if (!(Gc(b, K, m) | 0)) {
                                                        f = 0;
                                                        j = 53;
                                                        break a
                                                    }
                                                    F = F + 1 | 0;
                                                    J = (((N >> 1 | 0) == (G | 0)) << 31 >> 31) + J | 0;
                                                    break b
                                                }
                                            } while (0);
                                            Fc(b, K);
                                            D = D + 1 | 0
                                        }
                                    } while (0);
                                    J = J + 1 | 0;
                                    if ((J | 0) >= (c[I >> 2] | 0)) continue a
                                }
                            }
                            if ((j | 0) == 8) {
                                Yc(g, 0);
                                c[f >> 2] = c[h >> 2];
                                P = 1;
                                i = e;
                                return P | 0
                            } else if ((j | 0) == 53) { i = e; return f | 0 }
                            return 0
                        }

                        function Kc(b, e, f) {
                            b = b | 0;
                            e = e | 0;
                            f = f | 0;
                            var g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0;
                            h = i;
                            i = i + 16 | 0;
                            g = h + 12 | 0;
                            m = h + 8 | 0;
                            k = h + 4 | 0;
                            j = h;
                            l = (c[b + 544 >> 2] | 0) + (f << 2) | 0;
                            if (c[l >> 2] & 3) {
                                r = 1;
                                i = h;
                                return r | 0
                            }
                            if (Qb(b, l) | 0) {
                                r = 1;
                                i = h;
                                return r | 0
                            }
                            c[m >> 2] = c[b + 284 >> 2];
                            nc(b + 292 | 0, m);
                            p = c[l >> 2] | 0;
                            if (p >>> 0 > 31) {
                                m = b + 332 | 0;
                                n = 0;
                                o = -2;
                                do {
                                    q = c[l + (n << 2) + 4 >> 2] | 0;
                                    r = q >> 1;
                                    if ((r | 0) != (e | 0) ? (r = (d[(c[m >> 2] | 0) + r >> 0] | 0) ^ q & 1, t = a[2616] | 0, s = t & 255, ((r & 255) << 24 >> 24 == t << 24 >> 24 & (s >>> 1 ^ 1) | s & 2 & r | 0) == 0) : 0) {
                                        c[k >> 2] = q ^ 1;
                                        c[g + 0 >> 2] = c[k + 0 >> 2];
                                        Lb(b, g, -1);
                                        p = c[l >> 2] | 0
                                    } else o = q;
                                    n = n + 1 | 0
                                } while ((n | 0) < (p >>> 5 | 0))
                            } else o = -2;
                            t = (Mb(b) | 0) == -1;
                            Rb(b, 0);
                            if (!t) {
                                t = b + 712 | 0;
                                c[t >> 2] = (c[t >> 2] | 0) + 1;
                                c[j >> 2] = o;
                                c[g + 0 >> 2] = c[j + 0 >> 2];
                                if (!(Gc(b, f, g) | 0)) {
                                    t = 0;
                                    i = h;
                                    return t | 0
                                }
                            }
                            t = 1;
                            i = h;
                            return t | 0
                        }

                        function Lc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0;
                            e = i;
                            h = (c[b + 776 >> 2] | 0) + d | 0;
                            f = b + 760 | 0;
                            if (a[h >> 0] | 0) {
                                k = c[f >> 2] | 0;
                                g = k + (d * 12 | 0) + 4 | 0;
                                n = c[g >> 2] | 0;
                                if ((n | 0) > 0) {
                                    j = b + 804 | 0;
                                    k = c[k + (d * 12 | 0) >> 2] | 0;
                                    m = 0;
                                    l = 0;
                                    do {
                                        o = c[k + (m << 2) >> 2] | 0;
                                        if ((c[(c[c[j >> 2] >> 2] | 0) + (o << 2) >> 2] & 3 | 0) != 1) {
                                            c[k + (l << 2) >> 2] = o;
                                            n = c[g >> 2] | 0;
                                            l = l + 1 | 0
                                        }
                                        m = m + 1 | 0
                                    } while ((m | 0) < (n | 0))
                                } else {
                                    m = 0;
                                    l = 0
                                }
                                j = m - l | 0;
                                if ((j | 0) > 0) c[g >> 2] = n - j;
                                a[h >> 0] = 0
                            }
                            g = c[f >> 2] | 0;
                            n = a[(c[b + 332 >> 2] | 0) + d >> 0] | 0;
                            m = a[2624] | 0;
                            o = m & 255;
                            if (!((o >>> 1 ^ 1) & n << 24 >> 24 == m << 24 >> 24 | n & 2 & o)) {
                                o = 1;
                                i = e;
                                return o | 0
                            }
                            f = g + (d * 12 | 0) + 4 | 0;
                            h = c[f >> 2] | 0;
                            if (!h) {
                                o = 1;
                                i = e;
                                return o | 0
                            }
                            a: do {
                                if ((h | 0) > 0) {
                                    g = g + (d * 12 | 0) | 0;
                                    h = 0;
                                    while (1) {
                                        if (!(Kc(b, d, c[(c[g >> 2] | 0) + (h << 2) >> 2] | 0) | 0)) { b = 0; break }
                                        h = h + 1 | 0;
                                        if ((h | 0) >= (c[f >> 2] | 0)) break a
                                    }
                                    i = e;
                                    return b | 0
                                }
                            } while (0);
                            o = Jc(b, 0) | 0;
                            i = e;
                            return o | 0
                        }

                        function Mc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0,
                                A = 0,
                                B = 0,
                                C = 0,
                                D = 0,
                                E = 0,
                                G = 0,
                                H = 0,
                                I = 0,
                                J = 0,
                                K = 0,
                                L = 0,
                                M = 0,
                                N = 0,
                                O = 0,
                                P = 0,
                                Q = 0,
                                R = 0,
                                S = 0,
                                T = 0,
                                U = 0,
                                V = 0,
                                W = 0,
                                X = 0,
                                Y = 0,
                                Z = 0;
                            e = i;
                            i = i + 48 | 0;
                            s = e + 36 | 0;
                            r = e + 32 | 0;
                            t = e + 28 | 0;
                            u = e + 24 | 0;
                            f = e + 12 | 0;
                            g = e;
                            n = (c[b + 776 >> 2] | 0) + d | 0;
                            m = b + 760 | 0;
                            if (a[n >> 0] | 0) {
                                q = c[m >> 2] | 0;
                                o = q + (d * 12 | 0) + 4 | 0;
                                y = c[o >> 2] | 0;
                                if ((y | 0) > 0) {
                                    p = b + 804 | 0;
                                    q = c[q + (d * 12 | 0) >> 2] | 0;
                                    w = 0;
                                    v = 0;
                                    do {
                                        z = c[q + (w << 2) >> 2] | 0;
                                        if ((c[(c[c[p >> 2] >> 2] | 0) + (z << 2) >> 2] & 3 | 0) != 1) {
                                            c[q + (v << 2) >> 2] = z;
                                            y = c[o >> 2] | 0;
                                            v = v + 1 | 0
                                        }
                                        w = w + 1 | 0
                                    } while ((w | 0) < (y | 0))
                                } else {
                                    w = 0;
                                    v = 0
                                }
                                p = w - v | 0;
                                if ((p | 0) > 0) c[o >> 2] = y - p;
                                a[n >> 0] = 0
                            }
                            v = c[m >> 2] | 0;
                            w = v + (d * 12 | 0) | 0;
                            c[f >> 2] = 0;
                            n = f + 4 | 0;
                            c[n >> 2] = 0;
                            o = f + 8 | 0;
                            c[o >> 2] = 0;
                            c[g >> 2] = 0;
                            q = g + 4 | 0;
                            c[q >> 2] = 0;
                            p = g + 8 | 0;
                            c[p >> 2] = 0;
                            v = v + (d * 12 | 0) + 4 | 0;
                            a: do {
                                if ((c[v >> 2] | 0) > 0) {
                                    y = b + 544 | 0;
                                    B = d << 1;
                                    A = 0;
                                    do {
                                        C = (c[w >> 2] | 0) + (A << 2) | 0;
                                        E = (c[y >> 2] | 0) + (c[C >> 2] << 2) | 0;
                                        Z = c[E >> 2] | 0;
                                        z = Z >>> 5;
                                        b: do {
                                            if (Z >>> 0 > 31) {
                                                G = 0;
                                                while (1) {
                                                    D = G + 1 | 0;
                                                    if ((c[E + (G << 2) + 4 >> 2] | 0) == (B | 0)) { D = G; break b }
                                                    if ((D | 0) < (z | 0)) G = D;
                                                    else break
                                                }
                                            } else D = 0
                                        } while (0);
                                        _c((D | 0) < (z | 0) ? f : g, C);
                                        A = A + 1 | 0;
                                        z = c[v >> 2] | 0
                                    } while ((A | 0) < (z | 0));
                                    y = c[n >> 2] | 0;
                                    B = (y | 0) > 0;
                                    if (B) {
                                        C = c[q >> 2] | 0;
                                        K = (C | 0) > 0;
                                        J = b + 544 | 0;
                                        D = c[f >> 2] | 0;
                                        A = c[g >> 2] | 0;
                                        E = b + 708 | 0;
                                        I = b + 684 | 0;
                                        H = b + 688 | 0;
                                        P = 0;
                                        G = 0;
                                        while (1) {
                                            if (K) {
                                                M = D + (G << 2) | 0;
                                                L = c[J >> 2] | 0;
                                                N = c[E >> 2] | 0;
                                                O = 0;
                                                do {
                                                    S = L + (c[M >> 2] << 2) | 0;
                                                    U = L + (c[A + (O << 2) >> 2] << 2) | 0;
                                                    N = N + 1 | 0;
                                                    c[E >> 2] = N;
                                                    Q = (c[S >> 2] | 0) >>> 5 >>> 0 < (c[U >> 2] | 0) >>> 5 >>> 0;
                                                    R = Q ? U : S;
                                                    U = Q ? S : U;
                                                    S = R + 4 | 0;
                                                    Q = U + 4 | 0;
                                                    R = c[R >> 2] | 0;
                                                    T = R >>> 5;
                                                    W = T + -1 | 0;
                                                    U = c[U >> 2] | 0;
                                                    c: do {
                                                        if (U >>> 0 > 31) {
                                                            V = 0;
                                                            while (1) {
                                                                Z = c[Q + (V << 2) >> 2] | 0;
                                                                d: do {
                                                                    if ((Z >> 1 | 0) != (d | 0)) {
                                                                        e: do {
                                                                            if (R >>> 0 > 31) {
                                                                                Y = 0;
                                                                                while (1) {
                                                                                    X = c[S + (Y << 2) >> 2] | 0;
                                                                                    Y = Y + 1 | 0;
                                                                                    if ((X ^ Z) >>> 0 < 2) break;
                                                                                    if ((Y | 0) >= (T | 0)) break e
                                                                                }
                                                                                if ((X | 0) == (Z ^ 1 | 0)) break c;
                                                                                else break d
                                                                            }
                                                                        } while (0);W = W + 1 | 0
                                                                    }
                                                                } while (0);
                                                                V = V + 1 | 0;
                                                                if ((V | 0) >= (U >>> 5 | 0)) { x = 28; break }
                                                            }
                                                        } else x = 28
                                                    } while (0);
                                                    if ((x | 0) == 28) {
                                                        x = 0;
                                                        if ((P | 0) >= ((c[I >> 2] | 0) + z | 0)) { b = 1; break a }
                                                        Z = c[H >> 2] | 0;
                                                        if ((Z | 0) != -1 & (W | 0) > (Z | 0)) { b = 1; break a } else P = P + 1 | 0
                                                    }
                                                    O = O + 1 | 0
                                                } while ((O | 0) < (C | 0))
                                            }
                                            G = G + 1 | 0;
                                            if ((G | 0) >= (y | 0)) { x = 32; break }
                                        }
                                    } else {
                                        B = 0;
                                        x = 32
                                    }
                                } else {
                                    y = 0;
                                    B = 0;
                                    x = 32
                                }
                            } while (0);
                            f: do {
                                if ((x | 0) == 32) {
                                    a[(c[b + 904 >> 2] | 0) + d >> 0] = 1;
                                    z = b + 380 | 0;
                                    A = (c[z >> 2] | 0) + d | 0;
                                    if (a[A >> 0] | 0) {
                                        Z = b + 200 | 0;
                                        Y = Z;
                                        Y = ne(c[Y >> 2] | 0, c[Y + 4 >> 2] | 0, -1, -1) | 0;
                                        c[Z >> 2] = Y;
                                        c[Z + 4 >> 2] = F
                                    }
                                    a[A >> 0] = 0;
                                    A = b + 460 | 0;
                                    if (!((c[b + 476 >> 2] | 0) > (d | 0) ? (c[(c[b + 472 >> 2] | 0) + (d << 2) >> 2] | 0) > -1 : 0)) x = 36;
                                    if ((x | 0) == 36 ? (a[(c[z >> 2] | 0) + d >> 0] | 0) != 0 : 0) lc(A, d);
                                    x = b + 716 | 0;
                                    c[x >> 2] = (c[x >> 2] | 0) + 1;
                                    x = c[q >> 2] | 0;
                                    if ((y | 0) > (x | 0)) {
                                        A = b + 732 | 0;
                                        if ((x | 0) > 0) {
                                            u = b + 544 | 0;
                                            t = c[g >> 2] | 0;
                                            E = b + 736 | 0;
                                            D = 0;
                                            do {
                                                C = (c[u >> 2] | 0) + (c[t + (D << 2) >> 2] << 2) | 0;
                                                z = c[E >> 2] | 0;
                                                if ((c[C >> 2] | 0) >>> 0 > 31) {
                                                    G = 0;
                                                    H = -1;
                                                    do {
                                                        Z = C + (G << 2) + 4 | 0;
                                                        c[s >> 2] = c[Z >> 2];
                                                        _c(A, s);
                                                        H = (c[Z >> 2] >> 1 | 0) == (d | 0) ? G + z | 0 : H;
                                                        G = G + 1 | 0
                                                    } while ((G | 0) < ((c[C >> 2] | 0) >>> 5 | 0))
                                                } else H = -1;
                                                Z = c[A >> 2] | 0;
                                                X = Z + (H << 2) | 0;
                                                Y = c[X >> 2] | 0;
                                                Z = Z + (z << 2) | 0;
                                                c[X >> 2] = c[Z >> 2];
                                                c[Z >> 2] = Y;
                                                c[r >> 2] = (c[C >> 2] | 0) >>> 5;
                                                _c(A, r);
                                                D = D + 1 | 0
                                            } while ((D | 0) < (x | 0))
                                        }
                                        c[s >> 2] = d << 1;
                                        _c(A, s);
                                        c[r >> 2] = 1;
                                        _c(A, r)
                                    } else {
                                        D = b + 732 | 0;
                                        if (B) {
                                            G = b + 544 | 0;
                                            E = c[f >> 2] | 0;
                                            z = b + 736 | 0;
                                            H = 0;
                                            do {
                                                C = (c[G >> 2] | 0) + (c[E + (H << 2) >> 2] << 2) | 0;
                                                A = c[z >> 2] | 0;
                                                if ((c[C >> 2] | 0) >>> 0 > 31) {
                                                    I = 0;
                                                    J = -1;
                                                    do {
                                                        Z = C + (I << 2) + 4 | 0;
                                                        c[s >> 2] = c[Z >> 2];
                                                        _c(D, s);
                                                        J = (c[Z >> 2] >> 1 | 0) == (d | 0) ? I + A | 0 : J;
                                                        I = I + 1 | 0
                                                    } while ((I | 0) < ((c[C >> 2] | 0) >>> 5 | 0))
                                                } else J = -1;
                                                Z = c[D >> 2] | 0;
                                                X = Z + (J << 2) | 0;
                                                Y = c[X >> 2] | 0;
                                                Z = Z + (A << 2) | 0;
                                                c[X >> 2] = c[Z >> 2];
                                                c[Z >> 2] = Y;
                                                c[r >> 2] = (c[C >> 2] | 0) >>> 5;
                                                _c(D, r);
                                                H = H + 1 | 0
                                            } while ((H | 0) < (y | 0))
                                        }
                                        c[t >> 2] = d << 1 | 1;
                                        _c(D, t);
                                        c[u >> 2] = 1;
                                        _c(D, u)
                                    }
                                    if ((c[v >> 2] | 0) > 0) {
                                        r = 0;
                                        do {
                                            Fc(b, c[(c[w >> 2] | 0) + (r << 2) >> 2] | 0);
                                            r = r + 1 | 0
                                        } while ((r | 0) < (c[v >> 2] | 0))
                                    }
                                    r = b + 628 | 0;
                                    g: do {
                                        if (B) {
                                            s = b + 544 | 0;
                                            w = c[f >> 2] | 0;
                                            A = c[g >> 2] | 0;
                                            if ((x | 0) > 0) v = 0;
                                            else { r = 0; while (1) { r = r + 1 | 0; if ((r | 0) >= (y | 0)) break g } }
                                            do {
                                                u = w + (v << 2) | 0;
                                                t = 0;
                                                do {
                                                    Z = c[s >> 2] | 0;
                                                    if (Hc(b, Z + (c[u >> 2] << 2) | 0, Z + (c[A + (t << 2) >> 2] << 2) | 0, d, r) | 0 ? !(Dc(b, r) | 0) : 0) { b = 0; break f }
                                                    t = t + 1 | 0
                                                } while ((t | 0) < (x | 0));
                                                v = v + 1 | 0
                                            } while ((v | 0) < (y | 0))
                                        }
                                    } while (0);
                                    r = c[m >> 2] | 0;
                                    m = r + (d * 12 | 0) | 0;
                                    s = c[m >> 2] | 0;
                                    if (s) {
                                        c[r + (d * 12 | 0) + 4 >> 2] = 0;
                                        Td(s);
                                        c[m >> 2] = 0;
                                        c[r + (d * 12 | 0) + 8 >> 2] = 0
                                    }
                                    m = b + 412 | 0;
                                    d = d << 1;
                                    s = c[m >> 2] | 0;
                                    r = s + (d * 12 | 0) + 4 | 0;
                                    if ((c[r >> 2] | 0) == 0 ? (l = s + (d * 12 | 0) | 0, k = c[l >> 2] | 0, (k | 0) != 0) : 0) {
                                        c[r >> 2] = 0;
                                        Td(k);
                                        c[l >> 2] = 0;
                                        c[s + (d * 12 | 0) + 8 >> 2] = 0;
                                        s = c[m >> 2] | 0
                                    }
                                    k = d | 1;
                                    l = s + (k * 12 | 0) + 4 | 0;
                                    if ((c[l >> 2] | 0) == 0 ? (j = s + (k * 12 | 0) | 0, h = c[j >> 2] | 0, (h | 0) != 0) : 0) {
                                        c[l >> 2] = 0;
                                        Td(h);
                                        c[j >> 2] = 0;
                                        c[s + (k * 12 | 0) + 8 >> 2] = 0
                                    }
                                    b = Jc(b, 0) | 0;
                                    A = c[g >> 2] | 0
                                }
                            } while (0);
                            if (A) {
                                c[q >> 2] = 0;
                                Td(A);
                                c[g >> 2] = 0;
                                c[p >> 2] = 0
                            }
                            g = c[f >> 2] | 0;
                            if (!g) { i = e; return b | 0 }
                            c[n >> 2] = 0;
                            Td(g);
                            c[f >> 2] = 0;
                            c[o >> 2] = 0;
                            i = e;
                            return b | 0
                        }

                        function Nc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0;
                            e = i;
                            if (!(a[b + 724 >> 0] | 0)) { i = e; return }
                            l = b + 540 | 0;
                            if ((c[l >> 2] | 0) > 0) {
                                j = b + 760 | 0;
                                f = b + 804 | 0;
                                g = b + 776 | 0;
                                k = b + 544 | 0;
                                h = 0;
                                do {
                                    n = c[j >> 2] | 0;
                                    m = n + (h * 12 | 0) + 4 | 0;
                                    p = c[m >> 2] | 0;
                                    if ((p | 0) > 0) {
                                        n = c[n + (h * 12 | 0) >> 2] | 0;
                                        q = 0;
                                        o = 0;
                                        do {
                                            r = c[n + (q << 2) >> 2] | 0;
                                            if ((c[(c[c[f >> 2] >> 2] | 0) + (r << 2) >> 2] & 3 | 0) != 1) {
                                                c[n + (o << 2) >> 2] = r;
                                                p = c[m >> 2] | 0;
                                                o = o + 1 | 0
                                            }
                                            q = q + 1 | 0
                                        } while ((q | 0) < (p | 0))
                                    } else {
                                        q = 0;
                                        o = 0
                                    }
                                    n = q - o | 0;
                                    if ((n | 0) > 0) c[m >> 2] = p - n;
                                    a[(c[g >> 2] | 0) + h >> 0] = 0;
                                    n = c[j >> 2] | 0;
                                    m = n + (h * 12 | 0) + 4 | 0;
                                    if ((c[m >> 2] | 0) > 0) {
                                        r = n + (h * 12 | 0) | 0;
                                        p = 0;
                                        do {
                                            n = (c[r >> 2] | 0) + (p << 2) | 0;
                                            o = c[n >> 2] | 0;
                                            q = c[k >> 2] | 0;
                                            s = q + (o << 2) | 0;
                                            if (!(c[s >> 2] & 16)) {
                                                t = wc(d, s) | 0;
                                                c[n >> 2] = t;
                                                c[s >> 2] = c[s >> 2] | 16;
                                                c[q + (o + 1 << 2) >> 2] = t
                                            } else c[n >> 2] = c[q + (o + 1 << 2) >> 2];
                                            p = p + 1 | 0
                                        } while ((p | 0) < (c[m >> 2] | 0))
                                    }
                                    h = h + 1 | 0
                                } while ((h | 0) < (c[l >> 2] | 0))
                            }
                            f = b + 856 | 0;
                            t = c[b + 872 >> 2] | 0;
                            g = b + 868 | 0;
                            m = c[g >> 2] | 0;
                            k = t - m | 0;
                            if ((t | 0) < (m | 0)) k = (c[b + 860 >> 2] | 0) + k | 0;
                            a: do {
                                if ((k | 0) > 0) {
                                    h = b + 860 | 0;
                                    j = b + 544 | 0;
                                    while (1) {
                                        l = c[(c[f >> 2] | 0) + (m << 2) >> 2] | 0;
                                        n = m + 1 | 0;
                                        c[g >> 2] = (n | 0) == (c[h >> 2] | 0) ? 0 : n;
                                        n = c[j >> 2] | 0;
                                        o = n + (l << 2) | 0;
                                        m = c[o >> 2] | 0;
                                        if (!(m & 3)) {
                                            if (!(m & 16)) {
                                                t = wc(d, o) | 0;
                                                c[o >> 2] = c[o >> 2] | 16;
                                                c[n + (l + 1 << 2) >> 2] = t;
                                                l = t
                                            } else l = c[n + (l + 1 << 2) >> 2] | 0;
                                            Zc(f, l)
                                        }
                                        k = k + -1 | 0;
                                        if ((k | 0) <= 0) break a;
                                        m = c[g >> 2] | 0
                                    }
                                } else j = b + 544 | 0
                            } while (0);
                            b = b + 928 | 0;
                            f = c[b >> 2] | 0;
                            h = c[j >> 2] | 0;
                            g = h + (f << 2) | 0;
                            if (!(c[g >> 2] & 16)) {
                                t = wc(d, g) | 0;
                                c[b >> 2] = t;
                                c[g >> 2] = c[g >> 2] | 16;
                                c[h + (f + 1 << 2) >> 2] = t;
                                i = e;
                                return
                            } else {
                                c[b >> 2] = c[h + (f + 1 << 2) >> 2];
                                i = e;
                                return
                            }
                        }

                        function Oc(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            h = i;
                            i = i + 32 | 0;
                            l = h;
                            d = h + 8 | 0;
                            e = b + 544 | 0;
                            f = b + 548 | 0;
                            g = b + 556 | 0;
                            j = (c[f >> 2] | 0) - (c[g >> 2] | 0) | 0;
                            c[d + 0 >> 2] = 0;
                            c[d + 4 >> 2] = 0;
                            c[d + 8 >> 2] = 0;
                            c[d + 12 >> 2] = 0;
                            gc(d, j);
                            j = d + 16 | 0;
                            k = b + 560 | 0;
                            a[j >> 0] = a[k >> 0] | 0;
                            Nc(b, d);
                            ac(b, d);
                            if ((c[b + 44 >> 2] | 0) > 1) {
                                m = c[d + 4 >> 2] << 2;
                                c[l >> 2] = c[f >> 2] << 2;
                                c[l + 4 >> 2] = m;
                                La(3608, l | 0) | 0
                            }
                            a[k >> 0] = a[j >> 0] | 0;
                            j = c[e >> 2] | 0;
                            if (j) Td(j);
                            c[e >> 2] = c[d >> 2];
                            c[f >> 2] = c[d + 4 >> 2];
                            c[b + 552 >> 2] = c[d + 8 >> 2];
                            c[g >> 2] = c[d + 12 >> 2];
                            i = h;
                            return
                        }

                        function Pc() {
                            var d = 0,
                                e = 0,
                                f = 0;
                            d = i;
                            i = i + 16 | 0;
                            e = d;
                            a[2608] = 0;
                            a[2616] = 1;
                            a[2624] = 2;
                            xb(2632, 2656, 2664, 3744, 3752);
                            c[658] = 160;
                            a[2652] = 0;
                            xb(2704, 2728, 2736, 3744, 3752);
                            c[676] = 160;
                            a[2724] = 0;
                            xb(2784, 2808, 2816, 3744, 3752);
                            c[696] = 160;
                            a[2804] = 1;
                            xb(2848, 2880, 2888, 3744, 3736);
                            c[712] = 280;
                            f = 2868 | 0;
                            c[f >> 2] = -2147483648;
                            c[f + 4 >> 2] = 2147483647;
                            c[719] = 0;
                            xb(2960, 2992, 3e3, 3744, 3736);
                            c[740] = 280;
                            f = 2980 | 0;
                            c[f >> 2] = -1;
                            c[f + 4 >> 2] = 2147483647;
                            c[747] = 20;
                            xb(3112, 3144, 3152, 3744, 3736);
                            c[778] = 280;
                            f = 3132 | 0;
                            c[f >> 2] = -1;
                            c[f + 4 >> 2] = 2147483647;
                            c[785] = 1e3;
                            xb(3240, 3296, 3312, 3744, 3720);
                            c[810] = 2168;
                            h[408] = 0.0;
                            h[409] = v;
                            a[3280] = 0;
                            a[3281] = 0;
                            b[1641] = b[e + 0 >> 1] | 0;
                            b[1642] = b[e + 2 >> 1] | 0;
                            b[1643] = b[e + 4 >> 1] | 0;
                            h[411] = .5;
                            i = d;
                            return
                        }

                        function Qc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0;
                            d = i;
                            c[a >> 2] = 0;
                            e = a + 4 | 0;
                            c[e >> 2] = 0;
                            f = a + 8 | 0;
                            c[f >> 2] = 0;
                            if ((b | 0) <= 0) { i = d; return }
                            g = b + 1 & -2;
                            g = (g | 0) > 2 ? g : 2;
                            c[f >> 2] = g;
                            f = Ud(0, g << 2) | 0;
                            c[a >> 2] = f;
                            if ((f | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) Ta(va(1) | 0, 48, 0);
                            a = c[e >> 2] | 0;
                            if ((a | 0) < (b | 0))
                                do {
                                    g = f + (a << 2) | 0;
                                    if (g) c[g >> 2] = 0;
                                    a = a + 1 | 0
                                } while ((a | 0) != (b | 0));
                            c[e >> 2] = b;
                            i = d;
                            return
                        }

                        function Rc(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0;
                            b = i;
                            e = a + 32 | 0;
                            d = c[e >> 2] | 0;
                            if (d) {
                                c[a + 36 >> 2] = 0;
                                Td(d);
                                c[e >> 2] = 0;
                                c[a + 40 >> 2] = 0
                            }
                            e = a + 16 | 0;
                            d = c[e >> 2] | 0;
                            if (d) {
                                c[a + 20 >> 2] = 0;
                                Td(d);
                                c[e >> 2] = 0;
                                c[a + 24 >> 2] = 0
                            }
                            e = c[a >> 2] | 0;
                            if (!e) { i = b; return }
                            d = a + 4 | 0;
                            g = c[d >> 2] | 0;
                            if ((g | 0) > 0) {
                                f = 0;
                                do {
                                    j = e + (f * 12 | 0) | 0;
                                    h = c[j >> 2] | 0;
                                    if (h) {
                                        c[e + (f * 12 | 0) + 4 >> 2] = 0;
                                        Td(h);
                                        c[j >> 2] = 0;
                                        c[e + (f * 12 | 0) + 8 >> 2] = 0;
                                        e = c[a >> 2] | 0;
                                        g = c[d >> 2] | 0
                                    }
                                    f = f + 1 | 0
                                } while ((f | 0) < (g | 0))
                            }
                            c[d >> 2] = 0;
                            Td(e);
                            c[a >> 2] = 0;
                            c[a + 8 >> 2] = 0;
                            i = b;
                            return
                        }

                        function Sc(a, b, d) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            e = i;
                            b = c[b >> 2] | 0;
                            g = b + 1 | 0;
                            f = a + 4 | 0;
                            if ((c[f >> 2] | 0) >= (g | 0)) {
                                k = c[a >> 2] | 0;
                                k = k + (b << 2) | 0;
                                c[k >> 2] = d;
                                i = e;
                                return
                            }
                            h = a + 8 | 0;
                            k = c[h >> 2] | 0;
                            if ((k | 0) < (g | 0)) {
                                l = b + 2 - k & -2;
                                j = (k >> 1) + 2 & -2;
                                j = (l | 0) > (j | 0) ? l : j;
                                if ((j | 0) > (2147483647 - k | 0)) {
                                    l = va(1) | 0;
                                    Ta(l | 0, 48, 0)
                                }
                                m = c[a >> 2] | 0;
                                l = j + k | 0;
                                c[h >> 2] = l;
                                l = Ud(m, l << 2) | 0;
                                c[a >> 2] = l;
                                if ((l | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    m = va(1) | 0;
                                    Ta(m | 0, 48, 0)
                                }
                            }
                            k = c[f >> 2] | 0;
                            if ((k | 0) < (g | 0)) {
                                h = c[a >> 2] | 0;
                                do {
                                    j = h + (k << 2) | 0;
                                    if (j) c[j >> 2] = 0;
                                    k = k + 1 | 0
                                } while ((k | 0) != (g | 0))
                            }
                            c[f >> 2] = g;
                            m = c[a >> 2] | 0;
                            m = m + (b << 2) | 0;
                            c[m >> 2] = d;
                            i = e;
                            return
                        }

                        function Tc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            e = i;
                            k = c[d >> 2] | 0;
                            g = k + 1 | 0;
                            f = b + 4 | 0;
                            if ((c[f >> 2] | 0) < (g | 0)) {
                                j = b + 8 | 0;
                                h = c[j >> 2] | 0;
                                if ((h | 0) < (g | 0)) {
                                    l = k + 2 - h & -2;
                                    k = (h >> 1) + 2 & -2;
                                    k = (l | 0) > (k | 0) ? l : k;
                                    if ((k | 0) > (2147483647 - h | 0)) {
                                        l = va(1) | 0;
                                        Ta(l | 0, 48, 0)
                                    }
                                    m = c[b >> 2] | 0;
                                    l = k + h | 0;
                                    c[j >> 2] = l;
                                    l = Ud(m, l * 12 | 0) | 0;
                                    c[b >> 2] = l;
                                    if ((l | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        m = va(1) | 0;
                                        Ta(m | 0, 48, 0)
                                    }
                                }
                                j = c[f >> 2] | 0;
                                if ((j | 0) < (g | 0)) {
                                    h = c[b >> 2] | 0;
                                    do {
                                        k = h + (j * 12 | 0) | 0;
                                        if (k) {
                                            c[k >> 2] = 0;
                                            c[h + (j * 12 | 0) + 4 >> 2] = 0;
                                            c[h + (j * 12 | 0) + 8 >> 2] = 0
                                        }
                                        j = j + 1 | 0
                                    } while ((j | 0) != (g | 0))
                                }
                                c[f >> 2] = g;
                                h = c[d >> 2] | 0
                            } else h = k;
                            f = c[b >> 2] | 0;
                            if (c[f + (h * 12 | 0) >> 2] | 0) {
                                c[f + (h * 12 | 0) + 4 >> 2] = 0;
                                h = c[d >> 2] | 0
                            }
                            d = b + 16 | 0;
                            f = h + 1 | 0;
                            g = b + 20 | 0;
                            if ((c[g >> 2] | 0) >= (f | 0)) { i = e; return }
                            j = b + 24 | 0;
                            b = c[j >> 2] | 0;
                            if ((b | 0) < (f | 0)) {
                                m = h + 2 - b & -2;
                                h = (b >> 1) + 2 & -2;
                                h = (m | 0) > (h | 0) ? m : h;
                                if ((h | 0) > (2147483647 - b | 0)) {
                                    m = va(1) | 0;
                                    Ta(m | 0, 48, 0)
                                }
                                l = c[d >> 2] | 0;
                                m = h + b | 0;
                                c[j >> 2] = m;
                                m = Ud(l, m) | 0;
                                c[d >> 2] = m;
                                if ((m | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    m = va(1) | 0;
                                    Ta(m | 0, 48, 0)
                                }
                            }
                            b = c[g >> 2] | 0;
                            if ((b | 0) < (f | 0))
                                do {
                                    a[(c[d >> 2] | 0) + b >> 0] = 0;
                                    b = b + 1 | 0
                                } while ((b | 0) != (f | 0));
                            c[g >> 2] = f;
                            i = e;
                            return
                        }

                        function Uc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0;
                            d = i;
                            i = i + 16 | 0;
                            g = d;
                            c[g >> 2] = b;
                            f = a + 12 | 0;
                            e = b + 1 | 0;
                            h = a + 16 | 0;
                            if ((c[h >> 2] | 0) < (e | 0)) {
                                k = a + 20 | 0;
                                j = c[k >> 2] | 0;
                                if ((j | 0) < (e | 0)) {
                                    m = b + 2 - j & -2;
                                    l = (j >> 1) + 2 & -2;
                                    l = (m | 0) > (l | 0) ? m : l;
                                    if ((l | 0) > (2147483647 - j | 0)) {
                                        m = va(1) | 0;
                                        Ta(m | 0, 48, 0)
                                    }
                                    n = c[f >> 2] | 0;
                                    m = l + j | 0;
                                    c[k >> 2] = m;
                                    m = Ud(n, m << 2) | 0;
                                    c[f >> 2] = m;
                                    if ((m | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        n = va(1) | 0;
                                        Ta(n | 0, 48, 0)
                                    }
                                }
                                j = c[h >> 2] | 0;
                                if ((e | 0) > (j | 0)) ke((c[f >> 2] | 0) + (j << 2) | 0, -1, e - j << 2 | 0) | 0;
                                c[h >> 2] = e
                            }
                            c[(c[f >> 2] | 0) + (b << 2) >> 2] = c[a + 4 >> 2];
                            nc(a, g);
                            e = c[f >> 2] | 0;
                            j = c[e + (b << 2) >> 2] | 0;
                            b = c[a >> 2] | 0;
                            f = c[b + (j << 2) >> 2] | 0;
                            if (!j) {
                                m = 0;
                                n = b + (m << 2) | 0;
                                c[n >> 2] = f;
                                n = e + (f << 2) | 0;
                                c[n >> 2] = m;
                                i = d;
                                return
                            }
                            a = a + 28 | 0;
                            g = f << 1;
                            h = g | 1;
                            while (1) {
                                m = j;
                                j = j + -1 >> 1;
                                l = b + (j << 2) | 0;
                                k = c[l >> 2] | 0;
                                r = c[c[a >> 2] >> 2] | 0;
                                o = c[r + (g << 2) >> 2] | 0;
                                q = c[r + (h << 2) >> 2] | 0;
                                o = we(q | 0, ((q | 0) < 0) << 31 >> 31 | 0, o | 0, ((o | 0) < 0) << 31 >> 31 | 0) | 0;
                                q = F;
                                p = k << 1;
                                n = c[r + (p << 2) >> 2] | 0;
                                p = c[r + ((p | 1) << 2) >> 2] | 0;
                                n = we(p | 0, ((p | 0) < 0) << 31 >> 31 | 0, n | 0, ((n | 0) < 0) << 31 >> 31 | 0) | 0;
                                p = F;
                                if (!(q >>> 0 < p >>> 0 | (q | 0) == (p | 0) & o >>> 0 < n >>> 0)) { a = 14; break }
                                c[b + (m << 2) >> 2] = k;
                                c[e + (c[l >> 2] << 2) >> 2] = m;
                                if (!j) {
                                    m = 0;
                                    a = 14;
                                    break
                                }
                            }
                            if ((a | 0) == 14) {
                                r = b + (m << 2) | 0;
                                c[r >> 2] = f;
                                r = e + (f << 2) | 0;
                                c[r >> 2] = m;
                                i = d;
                                return
                            }
                        }

                        function Vc(b, d) {
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0;
                            e = i;
                            h = b + 824 | 0;
                            l = (c[b + 840 >> 2] | 0) > (d | 0);
                            if (l ? (c[(c[b + 836 >> 2] | 0) + (d << 2) >> 2] | 0) > -1 : 0) j = 7;
                            else j = 3;
                            do {
                                if ((j | 0) == 3) {
                                    if (a[(c[b + 876 >> 2] | 0) + d >> 0] | 0) { i = e; return }
                                    if (a[(c[b + 904 >> 2] | 0) + d >> 0] | 0) { i = e; return }
                                    o = a[(c[b + 332 >> 2] | 0) + d >> 0] | 0;
                                    n = a[2624] | 0;
                                    p = n & 255;
                                    if ((p >>> 1 ^ 1) & o << 24 >> 24 == n << 24 >> 24 | o & 2 & p)
                                        if (l) { j = 7; break } else break;
                                    else { i = e; return }
                                }
                            } while (0);
                            if ((j | 0) == 7 ? (f = c[b + 836 >> 2] | 0, g = f + (d << 2) | 0, k = c[g >> 2] | 0, (k | 0) > -1) : 0) {
                                d = c[h >> 2] | 0;
                                j = c[d + (k << 2) >> 2] | 0;
                                a: do {
                                    if (!k) o = 0;
                                    else {
                                        l = b + 852 | 0;
                                        m = j << 1;
                                        b = m | 1;
                                        while (1) {
                                            o = k;
                                            k = k + -1 >> 1;
                                            p = d + (k << 2) | 0;
                                            n = c[p >> 2] | 0;
                                            u = c[c[l >> 2] >> 2] | 0;
                                            r = c[u + (m << 2) >> 2] | 0;
                                            t = c[u + (b << 2) >> 2] | 0;
                                            r = we(t | 0, ((t | 0) < 0) << 31 >> 31 | 0, r | 0, ((r | 0) < 0) << 31 >> 31 | 0) | 0;
                                            t = F;
                                            s = n << 1;
                                            q = c[u + (s << 2) >> 2] | 0;
                                            s = c[u + ((s | 1) << 2) >> 2] | 0;
                                            q = we(s | 0, ((s | 0) < 0) << 31 >> 31 | 0, q | 0, ((q | 0) < 0) << 31 >> 31 | 0) | 0;
                                            s = F;
                                            if (!(t >>> 0 < s >>> 0 | (t | 0) == (s | 0) & r >>> 0 < q >>> 0)) break a;
                                            c[d + (o << 2) >> 2] = n;
                                            c[f + (c[p >> 2] << 2) >> 2] = o;
                                            if (!k) { o = 0; break }
                                        }
                                    }
                                } while (0);
                                c[d + (o << 2) >> 2] = j;
                                c[f + (j << 2) >> 2] = o;
                                Wc(h, c[g >> 2] | 0);
                                i = e;
                                return
                            }
                            Uc(h, d);
                            i = e;
                            return
                        }

                        function Wc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0;
                            d = i;
                            e = c[a >> 2] | 0;
                            f = c[e + (b << 2) >> 2] | 0;
                            m = b << 1 | 1;
                            l = a + 4 | 0;
                            o = c[l >> 2] | 0;
                            if ((m | 0) >= (o | 0)) {
                                p = b;
                                q = a + 12 | 0;
                                o = e + (p << 2) | 0;
                                c[o >> 2] = f;
                                q = c[q >> 2] | 0;
                                q = q + (f << 2) | 0;
                                c[q >> 2] = p;
                                i = d;
                                return
                            }
                            h = a + 28 | 0;
                            k = f << 1;
                            j = k | 1;
                            a = a + 12 | 0;
                            while (1) {
                                n = (b << 1) + 2 | 0;
                                if ((n | 0) < (o | 0)) {
                                    p = c[e + (n << 2) >> 2] | 0;
                                    q = c[e + (m << 2) >> 2] | 0;
                                    u = p << 1;
                                    o = c[c[h >> 2] >> 2] | 0;
                                    s = c[o + (u << 2) >> 2] | 0;
                                    u = c[o + ((u | 1) << 2) >> 2] | 0;
                                    s = we(u | 0, ((u | 0) < 0) << 31 >> 31 | 0, s | 0, ((s | 0) < 0) << 31 >> 31 | 0) | 0;
                                    u = F;
                                    t = q << 1;
                                    r = c[o + (t << 2) >> 2] | 0;
                                    t = c[o + ((t | 1) << 2) >> 2] | 0;
                                    r = we(t | 0, ((t | 0) < 0) << 31 >> 31 | 0, r | 0, ((r | 0) < 0) << 31 >> 31 | 0) | 0;
                                    t = F;
                                    if (!(u >>> 0 < t >>> 0 | (u | 0) == (t | 0) & s >>> 0 < r >>> 0)) {
                                        p = q;
                                        g = 7
                                    }
                                } else {
                                    p = c[e + (m << 2) >> 2] | 0;
                                    o = c[c[h >> 2] >> 2] | 0;
                                    g = 7
                                }
                                if ((g | 0) == 7) {
                                    g = 0;
                                    n = m
                                }
                                r = p << 1;
                                t = c[o + (r << 2) >> 2] | 0;
                                r = c[o + ((r | 1) << 2) >> 2] | 0;
                                t = we(r | 0, ((r | 0) < 0) << 31 >> 31 | 0, t | 0, ((t | 0) < 0) << 31 >> 31 | 0) | 0;
                                r = F;
                                u = c[o + (k << 2) >> 2] | 0;
                                s = c[o + (j << 2) >> 2] | 0;
                                u = we(s | 0, ((s | 0) < 0) << 31 >> 31 | 0, u | 0, ((u | 0) < 0) << 31 >> 31 | 0) | 0;
                                s = F;
                                if (!(r >>> 0 < s >>> 0 | (r | 0) == (s | 0) & t >>> 0 < u >>> 0)) { g = 10; break }
                                c[e + (b << 2) >> 2] = p;
                                c[(c[a >> 2] | 0) + (p << 2) >> 2] = b;
                                m = n << 1 | 1;
                                o = c[l >> 2] | 0;
                                if ((m | 0) >= (o | 0)) {
                                    b = n;
                                    g = 10;
                                    break
                                } else b = n
                            }
                            if ((g | 0) == 10) {
                                u = e + (b << 2) | 0;
                                c[u >> 2] = f;
                                u = c[a >> 2] | 0;
                                u = u + (f << 2) | 0;
                                c[u >> 2] = b;
                                i = d;
                                return
                            }
                        }

                        function Xc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0;
                            d = i;
                            h = c[a >> 2] | 0;
                            if (h) {
                                e = a + 4 | 0;
                                f = c[e >> 2] | 0;
                                a: do {
                                    if ((f | 0) > 0) {
                                        g = 0;
                                        while (1) {
                                            j = h + (g * 12 | 0) | 0;
                                            k = c[j >> 2] | 0;
                                            if (k) {
                                                c[h + (g * 12 | 0) + 4 >> 2] = 0;
                                                Td(k);
                                                c[j >> 2] = 0;
                                                c[h + (g * 12 | 0) + 8 >> 2] = 0;
                                                f = c[e >> 2] | 0
                                            }
                                            g = g + 1 | 0;
                                            if ((g | 0) >= (f | 0)) break a;
                                            h = c[a >> 2] | 0
                                        }
                                    }
                                } while (0);
                                c[e >> 2] = 0;
                                if (b) {
                                    Td(c[a >> 2] | 0);
                                    c[a >> 2] = 0;
                                    c[a + 8 >> 2] = 0
                                }
                            }
                            e = a + 16 | 0;
                            f = c[e >> 2] | 0;
                            if ((f | 0) != 0 ? (c[a + 20 >> 2] = 0, b) : 0) {
                                Td(f);
                                c[e >> 2] = 0;
                                c[a + 24 >> 2] = 0
                            }
                            f = a + 32 | 0;
                            e = c[f >> 2] | 0;
                            if (!e) { i = d; return }
                            c[a + 36 >> 2] = 0;
                            if (!b) { i = d; return }
                            Td(e);
                            c[f >> 2] = 0;
                            c[a + 40 >> 2] = 0;
                            i = d;
                            return
                        }

                        function Yc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0;
                            e = i;
                            f = c[a >> 2] | 0;
                            d = a + 4 | 0;
                            if (f) {
                                c[d >> 2] = 0;
                                if (b) {
                                    Td(f);
                                    c[a >> 2] = 0;
                                    c[a + 8 >> 2] = 0;
                                    f = 0
                                }
                            } else f = 0;
                            if ((c[d >> 2] | 0) >= 1) {
                                h = a + 16 | 0;
                                c[h >> 2] = 0;
                                h = a + 12 | 0;
                                c[h >> 2] = 0;
                                i = e;
                                return
                            }
                            h = a + 8 | 0;
                            g = c[h >> 2] | 0;
                            if ((g | 0) < 1) {
                                j = 2 - g & -2;
                                b = (g >> 1) + 2 & -2;
                                b = (j | 0) > (b | 0) ? j : b;
                                if ((b | 0) > (2147483647 - g | 0)) {
                                    j = va(1) | 0;
                                    Ta(j | 0, 48, 0)
                                }
                                j = b + g | 0;
                                c[h >> 2] = j;
                                f = Ud(f, j << 2) | 0;
                                c[a >> 2] = f;
                                if ((f | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    j = va(1) | 0;
                                    Ta(j | 0, 48, 0)
                                }
                            }
                            b = c[d >> 2] | 0;
                            if ((b | 0) < 1)
                                while (1) {
                                    g = f + (b << 2) | 0;
                                    if (g) c[g >> 2] = 0;
                                    if (!b) break;
                                    else b = b + 1 | 0
                                }
                            c[d >> 2] = 1;
                            j = a + 16 | 0;
                            c[j >> 2] = 0;
                            j = a + 12 | 0;
                            c[j >> 2] = 0;
                            i = e;
                            return
                        }

                        function Zc(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            e = i;
                            i = i + 16 | 0;
                            d = e;
                            f = a + 16 | 0;
                            j = c[f >> 2] | 0;
                            c[f >> 2] = j + 1;
                            c[(c[a >> 2] | 0) + (j << 2) >> 2] = b;
                            j = c[f >> 2] | 0;
                            b = a + 4 | 0;
                            h = c[b >> 2] | 0;
                            if ((j | 0) == (h | 0)) {
                                c[f >> 2] = 0;
                                j = 0
                            }
                            g = a + 12 | 0;
                            if ((c[g >> 2] | 0) != (j | 0)) { i = e; return }
                            Qc(d, (h * 3 | 0) + 1 >> 1);
                            l = c[g >> 2] | 0;
                            m = c[b >> 2] | 0;
                            if ((l | 0) < (m | 0)) {
                                j = c[a >> 2] | 0;
                                k = c[d >> 2] | 0;
                                m = 0;
                                while (1) {
                                    h = m + 1 | 0;
                                    c[k + (m << 2) >> 2] = c[j + (l << 2) >> 2];
                                    l = l + 1 | 0;
                                    m = c[b >> 2] | 0;
                                    if ((l | 0) >= (m | 0)) { k = h; break } else m = h
                                }
                            } else k = 0;
                            h = c[a >> 2] | 0;
                            if ((c[f >> 2] | 0) > 0) {
                                j = c[d >> 2] | 0;
                                l = 0;
                                while (1) {
                                    c[j + (k << 2) >> 2] = c[h + (l << 2) >> 2];
                                    l = l + 1 | 0;
                                    if ((l | 0) >= (c[f >> 2] | 0)) break;
                                    else k = k + 1 | 0
                                }
                                m = c[b >> 2] | 0
                            }
                            c[g >> 2] = 0;
                            c[f >> 2] = m;
                            if (!h) f = a + 8 | 0;
                            else {
                                c[b >> 2] = 0;
                                Td(h);
                                c[a >> 2] = 0;
                                f = a + 8 | 0;
                                c[f >> 2] = 0
                            }
                            c[a >> 2] = c[d >> 2];
                            l = d + 4 | 0;
                            c[b >> 2] = c[l >> 2];
                            m = d + 8 | 0;
                            c[f >> 2] = c[m >> 2];
                            c[d >> 2] = 0;
                            c[l >> 2] = 0;
                            c[m >> 2] = 0;
                            i = e;
                            return
                        }

                        function _c(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0;
                            d = i;
                            e = a + 4 | 0;
                            f = c[e >> 2] | 0;
                            g = a + 8 | 0;
                            h = c[g >> 2] | 0;
                            if ((f | 0) == (h | 0) & (h | 0) < (f + 1 | 0)) {
                                h = (f >> 1) + 2 & -2;
                                h = (h | 0) < 2 ? 2 : h;
                                if ((h | 0) > (2147483647 - f | 0)) {
                                    h = va(1) | 0;
                                    Ta(h | 0, 48, 0)
                                }
                                j = c[a >> 2] | 0;
                                f = h + f | 0;
                                c[g >> 2] = f;
                                f = Ud(j, f << 2) | 0;
                                c[a >> 2] = f;
                                if ((f | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                    j = va(1) | 0;
                                    Ta(j | 0, 48, 0)
                                }
                            } else f = c[a >> 2] | 0;
                            j = c[e >> 2] | 0;
                            c[e >> 2] = j + 1;
                            e = f + (j << 2) | 0;
                            if (!e) { i = d; return }
                            c[e >> 2] = c[b >> 2];
                            i = d;
                            return
                        }

                        function $c() {
                            var a = 0,
                                b = 0;
                            b = i;
                            Ka(3864) | 0;
                            a = od(936) | 0;
                            xc(a);
                            i = b;
                            return a | 0
                        }

                        function ad(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            if (!a) { i = b; return }
                            gb[c[(c[a >> 2] | 0) + 4 >> 2] & 31](a);
                            i = b;
                            return
                        }

                        function bd() {
                            var b = 0,
                                d = 0,
                                e = 0;
                            b = i;
                            i = i + 16 | 0;
                            d = b;
                            e = od(936) | 0;
                            xc(e);
                            c[964] = e;
                            Cc(e, 1) | 0;
                            e = c[964] | 0;
                            a[d + 0 >> 0] = a[3840] | 0;
                            Ac(e, d, 1) | 0;
                            i = b;
                            return
                        }

                        function cd(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0;
                            d = i;
                            i = i + 16 | 0;
                            e = d;
                            if ((c[962] | 0) >= (b | 0)) { i = d; return }
                            do {
                                f = c[964] | 0;
                                a[e + 0 >> 0] = a[3840] | 0;
                                Ac(f, e, 1) | 0;
                                f = (c[962] | 0) + 1 | 0;
                                c[962] = f
                            } while ((f | 0) < (b | 0));
                            i = d;
                            return
                        }

                        function dd(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            g = i;
                            i = i + 32 | 0;
                            h = g + 16 | 0;
                            e = g + 4 | 0;
                            j = g;
                            c[e >> 2] = 0;
                            f = e + 4 | 0;
                            c[f >> 2] = 0;
                            d = e + 8 | 0;
                            c[d >> 2] = 0;
                            k = c[b >> 2] | 0;
                            if (k)
                                do {
                                    l = (k | 0) < 0 ? 0 - k | 0 : k;
                                    if ((c[962] | 0) < (l | 0))
                                        do {
                                            m = c[964] | 0;
                                            a[h + 0 >> 0] = a[3840] | 0;
                                            Ac(m, h, 1) | 0;
                                            m = (c[962] | 0) + 1 | 0;
                                            c[962] = m
                                        } while ((m | 0) < (l | 0));
                                    c[j >> 2] = l << 1 | k >>> 31;
                                    mc(e, j);
                                    b = b + 4 | 0;
                                    k = c[b >> 2] | 0
                                } while ((k | 0) != 0);
                            j = c[964] | 0;
                            h = j + 628 | 0;
                            ld(e, h);
                            h = Dc(j, h) | 0;
                            j = c[e >> 2] | 0;
                            if (!j) { i = g; return h | 0 }
                            c[f >> 2] = 0;
                            Td(j);
                            c[e >> 2] = 0;
                            c[d >> 2] = 0;
                            i = g;
                            return h | 0
                        }

                        function ed() {
                            var b = 0,
                                d = 0,
                                e = 0,
                                f = 0;
                            d = i;
                            i = i + 16 | 0;
                            b = d;
                            e = c[964] | 0;
                            f = e + 664 | 0;
                            c[f + 0 >> 2] = -1;
                            c[f + 4 >> 2] = -1;
                            c[f + 8 >> 2] = -1;
                            c[f + 12 >> 2] = -1;
                            if (c[e + 304 >> 2] | 0) c[e + 308 >> 2] = 0;
                            Bc(b, e, 1, 0);
                            i = d;
                            return (a[b >> 0] | 0) == 0 | 0
                        }

                        function fd() { return (c[(c[964] | 0) + 4 >> 2] | 0) + 1 | 0 }

                        function gd() { return c[962] | 0 }

                        function hd(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0;
                            d = i;
                            i = i + 32 | 0;
                            h = d + 16 | 0;
                            f = d + 4 | 0;
                            j = d;
                            c[f >> 2] = 0;
                            e = f + 4 | 0;
                            c[e >> 2] = 0;
                            g = f + 8 | 0;
                            c[g >> 2] = 0;
                            c[j >> 2] = b << 1;
                            mc(f, j);
                            b = c[964] | 0;
                            j = b + 664 | 0;
                            c[j + 0 >> 2] = -1;
                            c[j + 4 >> 2] = -1;
                            c[j + 8 >> 2] = -1;
                            c[j + 12 >> 2] = -1;
                            ld(f, b + 304 | 0);
                            Bc(h, b, 1, 0);
                            b = (a[h >> 0] | 0) == 0;
                            h = c[f >> 2] | 0;
                            if (!h) { i = d; return b | 0 }
                            c[e >> 2] = 0;
                            Td(h);
                            c[f >> 2] = 0;
                            c[g >> 2] = 0;
                            i = d;
                            return b | 0
                        }

                        function id(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0,
                                e = 0;
                            b = i;
                            i = i + 16 | 0;
                            e = b;
                            d = c[964] | 0;
                            c[e >> 2] = a << 1 | 1;
                            a = d + 628 | 0;
                            if (c[a >> 2] | 0) c[d + 632 >> 2] = 0;
                            mc(a, e);
                            Dc(d, a) | 0;
                            i = b;
                            return
                        }

                        function jd() { return c[(c[964] | 0) + 36 >> 2] | 0 }

                        function kd() { return c[(c[964] | 0) + 32 >> 2] | 0 }

                        function ld(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            d = i;
                            h = c[b >> 2] | 0;
                            e = b + 4 | 0;
                            if (!h) j = c[e >> 2] | 0;
                            else {
                                c[e >> 2] = 0;
                                j = 0
                            }
                            e = a + 4 | 0;
                            f = c[e >> 2] | 0;
                            g = b + 4 | 0;
                            if ((j | 0) < (f | 0)) {
                                k = b + 8 | 0;
                                j = c[k >> 2] | 0;
                                if ((j | 0) < (f | 0)) {
                                    m = f + 1 - j & -2;
                                    l = (j >> 1) + 2 & -2;
                                    l = (m | 0) > (l | 0) ? m : l;
                                    if ((l | 0) > (2147483647 - j | 0)) {
                                        m = va(1) | 0;
                                        Ta(m | 0, 48, 0)
                                    }
                                    m = l + j | 0;
                                    c[k >> 2] = m;
                                    h = Ud(h, m << 2) | 0;
                                    c[b >> 2] = h;
                                    if ((h | 0) == 0 ? (c[(Oa() | 0) >> 2] | 0) == 12 : 0) {
                                        m = va(1) | 0;
                                        Ta(m | 0, 48, 0)
                                    }
                                }
                                j = c[g >> 2] | 0;
                                a: do {
                                    if ((j | 0) < (f | 0))
                                        while (1) {
                                            h = h + (j << 2) | 0;
                                            if (h) c[h >> 2] = 0;
                                            j = j + 1 | 0;
                                            if ((j | 0) == (f | 0)) break a;
                                            h = c[b >> 2] | 0
                                        }
                                } while (0);
                                c[g >> 2] = f;
                                f = c[e >> 2] | 0
                            }
                            if ((f | 0) <= 0) { i = d; return }
                            b = c[b >> 2] | 0;
                            a = c[a >> 2] | 0;
                            f = 0;
                            do {
                                c[b + (f << 2) >> 2] = c[a + (f << 2) >> 2];
                                f = f + 1 | 0
                            } while ((f | 0) < (c[e >> 2] | 0));
                            i = d;
                            return
                        }

                        function md(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0;
                            d = i;
                            i = i + 16 | 0;
                            c[d >> 2] = b;
                            b = c[p >> 2] | 0;
                            ua(b | 0, a | 0, d | 0) | 0;
                            Sa(10, b | 0) | 0;
                            Wa()
                        }

                        function nd() {
                            var a = 0,
                                b = 0;
                            a = i;
                            i = i + 16 | 0;
                            if (!(Ja(4064, 3) | 0)) {
                                b = Ha(c[1014] | 0) | 0;
                                i = a;
                                return b | 0
                            } else md(4072, a);
                            return 0
                        }

                        function od(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0;
                            b = i;
                            a = (a | 0) == 0 ? 1 : a;
                            d = Sd(a) | 0;
                            if (d) { i = b; return d | 0 }
                            while (1) {
                                d = vd() | 0;
                                if (!d) { a = 4; break }
                                jb[d & 3]();
                                d = Sd(a) | 0;
                                if (d) { a = 5; break }
                            }
                            if ((a | 0) == 4) {
                                d = va(4) | 0;
                                c[d >> 2] = 4248;
                                Ta(d | 0, 4296, 12)
                            } else if ((a | 0) == 5) { i = b; return d | 0 }
                            return 0
                        }

                        function pd(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            Td(a);
                            i = b;
                            return
                        }

                        function qd(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            pd(a);
                            i = b;
                            return
                        }

                        function rd(a) { a = a | 0; return }

                        function sd(a) { a = a | 0; return 4264 }

                        function td(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            i = i + 16 | 0;
                            jb[a & 3]();
                            md(4312, b)
                        }

                        function ud() {
                            var a = 0,
                                b = 0;
                            b = nd() | 0;
                            if (((b | 0) != 0 ? (a = c[b >> 2] | 0, (a | 0) != 0) : 0) ? (b = a + 48 | 0, (c[b >> 2] & -256 | 0) == 1126902528 ? (c[b + 4 >> 2] | 0) == 1129074247 : 0) : 0) td(c[a + 12 >> 2] | 0);
                            b = c[968] | 0;
                            c[968] = b + 0;
                            td(b)
                        }

                        function vd() {
                            var a = 0;
                            a = c[1102] | 0;
                            c[1102] = a + 0;
                            return a | 0
                        }

                        function wd(a) { a = a | 0; return }

                        function xd(a) { a = a | 0; return }

                        function yd(a) { a = a | 0; return }

                        function zd(a) { a = a | 0; return }

                        function Ad(a) { a = a | 0; return }

                        function Bd(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            pd(a);
                            i = b;
                            return
                        }

                        function Cd(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            pd(a);
                            i = b;
                            return
                        }

                        function Dd(a, b, d) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0;
                            e = i;
                            i = i + 64 | 0;
                            f = e;
                            if ((a | 0) == (b | 0)) {
                                h = 1;
                                i = e;
                                return h | 0
                            }
                            if (!b) {
                                h = 0;
                                i = e;
                                return h | 0
                            }
                            b = Hd(b, 4504, 4560, 0) | 0;
                            if (!b) {
                                h = 0;
                                i = e;
                                return h | 0
                            }
                            h = f + 0 | 0;
                            g = h + 56 | 0;
                            do {
                                c[h >> 2] = 0;
                                h = h + 4 | 0
                            } while ((h | 0) < (g | 0));
                            c[f >> 2] = b;
                            c[f + 8 >> 2] = a;
                            c[f + 12 >> 2] = -1;
                            c[f + 48 >> 2] = 1;
                            mb[c[(c[b >> 2] | 0) + 28 >> 2] & 3](b, f, c[d >> 2] | 0, 1);
                            if ((c[f + 24 >> 2] | 0) != 1) {
                                h = 0;
                                i = e;
                                return h | 0
                            }
                            c[d >> 2] = c[f + 16 >> 2];
                            h = 1;
                            i = e;
                            return h | 0
                        }

                        function Ed(b, d, e, f) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            var g = 0,
                                h = 0;
                            b = i;
                            g = d + 16 | 0;
                            h = c[g >> 2] | 0;
                            if (!h) {
                                c[g >> 2] = e;
                                c[d + 24 >> 2] = f;
                                c[d + 36 >> 2] = 1;
                                i = b;
                                return
                            }
                            if ((h | 0) != (e | 0)) {
                                h = d + 36 | 0;
                                c[h >> 2] = (c[h >> 2] | 0) + 1;
                                c[d + 24 >> 2] = 2;
                                a[d + 54 >> 0] = 1;
                                i = b;
                                return
                            }
                            e = d + 24 | 0;
                            if ((c[e >> 2] | 0) != 2) { i = b; return }
                            c[e >> 2] = f;
                            i = b;
                            return
                        }

                        function Fd(a, b, d, e) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0;
                            f = i;
                            if ((c[b + 8 >> 2] | 0) != (a | 0)) { i = f; return }
                            Ed(0, b, d, e);
                            i = f;
                            return
                        }

                        function Gd(a, b, d, e) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0;
                            f = i;
                            if ((a | 0) == (c[b + 8 >> 2] | 0)) {
                                Ed(0, b, d, e);
                                i = f;
                                return
                            } else {
                                a = c[a + 8 >> 2] | 0;
                                mb[c[(c[a >> 2] | 0) + 28 >> 2] & 3](a, b, d, e);
                                i = f;
                                return
                            }
                        }

                        function Hd(d, e, f, g) {
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            var h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0;
                            h = i;
                            i = i + 64 | 0;
                            j = h;
                            k = c[d >> 2] | 0;
                            l = d + (c[k + -8 >> 2] | 0) | 0;
                            k = c[k + -4 >> 2] | 0;
                            c[j >> 2] = f;
                            c[j + 4 >> 2] = d;
                            c[j + 8 >> 2] = e;
                            c[j + 12 >> 2] = g;
                            n = j + 16 | 0;
                            o = j + 20 | 0;
                            e = j + 24 | 0;
                            m = j + 28 | 0;
                            g = j + 32 | 0;
                            d = j + 40 | 0;
                            p = (k | 0) == (f | 0);
                            q = n + 0 | 0;
                            f = q + 36 | 0;
                            do {
                                c[q >> 2] = 0;
                                q = q + 4 | 0
                            } while ((q | 0) < (f | 0));
                            b[n + 36 >> 1] = 0;
                            a[n + 38 >> 0] = 0;
                            if (p) {
                                c[j + 48 >> 2] = 1;
                                kb[c[(c[k >> 2] | 0) + 20 >> 2] & 3](k, j, l, l, 1, 0);
                                q = (c[e >> 2] | 0) == 1 ? l : 0;
                                i = h;
                                return q | 0
                            }
                            fb[c[(c[k >> 2] | 0) + 24 >> 2] & 3](k, j, l, 1, 0);
                            j = c[j + 36 >> 2] | 0;
                            if (!j) {
                                q = (c[d >> 2] | 0) == 1 & (c[m >> 2] | 0) == 1 & (c[g >> 2] | 0) == 1 ? c[o >> 2] | 0 : 0;
                                i = h;
                                return q | 0
                            } else if ((j | 0) == 1) {
                                if ((c[e >> 2] | 0) != 1 ? !((c[d >> 2] | 0) == 0 & (c[m >> 2] | 0) == 1 & (c[g >> 2] | 0) == 1) : 0) {
                                    q = 0;
                                    i = h;
                                    return q | 0
                                }
                                q = c[n >> 2] | 0;
                                i = h;
                                return q | 0
                            } else {
                                q = 0;
                                i = h;
                                return q | 0
                            }
                            return 0
                        }

                        function Id(b, d, e, f, g) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            var h = 0;
                            b = i;
                            a[d + 53 >> 0] = 1;
                            if ((c[d + 4 >> 2] | 0) != (f | 0)) { i = b; return }
                            a[d + 52 >> 0] = 1;
                            f = d + 16 | 0;
                            h = c[f >> 2] | 0;
                            if (!h) {
                                c[f >> 2] = e;
                                c[d + 24 >> 2] = g;
                                c[d + 36 >> 2] = 1;
                                if (!((g | 0) == 1 ? (c[d + 48 >> 2] | 0) == 1 : 0)) { i = b; return }
                                a[d + 54 >> 0] = 1;
                                i = b;
                                return
                            }
                            if ((h | 0) != (e | 0)) {
                                h = d + 36 | 0;
                                c[h >> 2] = (c[h >> 2] | 0) + 1;
                                a[d + 54 >> 0] = 1;
                                i = b;
                                return
                            }
                            e = d + 24 | 0;
                            f = c[e >> 2] | 0;
                            if ((f | 0) == 2) c[e >> 2] = g;
                            else g = f;
                            if (!((g | 0) == 1 ? (c[d + 48 >> 2] | 0) == 1 : 0)) { i = b; return }
                            a[d + 54 >> 0] = 1;
                            i = b;
                            return
                        }

                        function Jd(b, d, e, f, g) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            var h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0;
                            h = i;
                            if ((b | 0) == (c[d + 8 >> 2] | 0)) {
                                if ((c[d + 4 >> 2] | 0) != (e | 0)) { i = h; return }
                                j = d + 28 | 0;
                                if ((c[j >> 2] | 0) == 1) { i = h; return }
                                c[j >> 2] = f;
                                i = h;
                                return
                            }
                            if ((b | 0) != (c[d >> 2] | 0)) {
                                l = c[b + 8 >> 2] | 0;
                                fb[c[(c[l >> 2] | 0) + 24 >> 2] & 3](l, d, e, f, g);
                                i = h;
                                return
                            }
                            if ((c[d + 16 >> 2] | 0) != (e | 0) ? (k = d + 20 | 0, (c[k >> 2] | 0) != (e | 0)) : 0) {
                                c[d + 32 >> 2] = f;
                                f = d + 44 | 0;
                                if ((c[f >> 2] | 0) == 4) { i = h; return }
                                l = d + 52 | 0;
                                a[l >> 0] = 0;
                                m = d + 53 | 0;
                                a[m >> 0] = 0;
                                b = c[b + 8 >> 2] | 0;
                                kb[c[(c[b >> 2] | 0) + 20 >> 2] & 3](b, d, e, e, 1, g);
                                if (a[m >> 0] | 0) {
                                    if (!(a[l >> 0] | 0)) {
                                        b = 1;
                                        j = 13
                                    }
                                } else {
                                    b = 0;
                                    j = 13
                                }
                                do {
                                    if ((j | 0) == 13) {
                                        c[k >> 2] = e;
                                        m = d + 40 | 0;
                                        c[m >> 2] = (c[m >> 2] | 0) + 1;
                                        if ((c[d + 36 >> 2] | 0) == 1 ? (c[d + 24 >> 2] | 0) == 2 : 0) { a[d + 54 >> 0] = 1; if (b) break } else j = 16;
                                        if ((j | 0) == 16 ? b : 0) break;
                                        c[f >> 2] = 4;
                                        i = h;
                                        return
                                    }
                                } while (0);
                                c[f >> 2] = 3;
                                i = h;
                                return
                            }
                            if ((f | 0) != 1) { i = h; return }
                            c[d + 32 >> 2] = 1;
                            i = h;
                            return
                        }

                        function Kd(b, d, e, f, g) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            var h = 0;
                            g = i;
                            if ((c[d + 8 >> 2] | 0) == (b | 0)) {
                                if ((c[d + 4 >> 2] | 0) != (e | 0)) { i = g; return }
                                d = d + 28 | 0;
                                if ((c[d >> 2] | 0) == 1) { i = g; return }
                                c[d >> 2] = f;
                                i = g;
                                return
                            }
                            if ((c[d >> 2] | 0) != (b | 0)) { i = g; return }
                            if ((c[d + 16 >> 2] | 0) != (e | 0) ? (h = d + 20 | 0, (c[h >> 2] | 0) != (e | 0)) : 0) {
                                c[d + 32 >> 2] = f;
                                c[h >> 2] = e;
                                b = d + 40 | 0;
                                c[b >> 2] = (c[b >> 2] | 0) + 1;
                                if ((c[d + 36 >> 2] | 0) == 1 ? (c[d + 24 >> 2] | 0) == 2 : 0) a[d + 54 >> 0] = 1;
                                c[d + 44 >> 2] = 4;
                                i = g;
                                return
                            }
                            if ((f | 0) != 1) { i = g; return }
                            c[d + 32 >> 2] = 1;
                            i = g;
                            return
                        }

                        function Ld(a, b, d, e, f, g) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            var h = 0;
                            h = i;
                            if ((a | 0) == (c[b + 8 >> 2] | 0)) {
                                Id(0, b, d, e, f);
                                i = h;
                                return
                            } else {
                                a = c[a + 8 >> 2] | 0;
                                kb[c[(c[a >> 2] | 0) + 20 >> 2] & 3](a, b, d, e, f, g);
                                i = h;
                                return
                            }
                        }

                        function Md(a, b, d, e, f, g) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            g = i;
                            if ((c[b + 8 >> 2] | 0) != (a | 0)) { i = g; return }
                            Id(0, b, d, e, f);
                            i = g;
                            return
                        }

                        function Nd(a, b, d) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0;
                            e = i;
                            i = i + 16 | 0;
                            f = e;
                            c[f >> 2] = c[d >> 2];
                            a = eb[c[(c[a >> 2] | 0) + 16 >> 2] & 1](a, b, f) | 0;
                            b = a & 1;
                            if (!a) { i = e; return b | 0 }
                            c[d >> 2] = c[f >> 2];
                            i = e;
                            return b | 0
                        }

                        function Od(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            if (!a) a = 0;
                            else a = (Hd(a, 4504, 4672, 0) | 0) != 0;
                            i = b;
                            return a & 1 | 0
                        }

                        function Pd() {
                            var a = 0,
                                b = 0,
                                d = 0,
                                e = 0,
                                f = 0;
                            a = i;
                            i = i + 16 | 0;
                            b = a;
                            a = a + 12 | 0;
                            d = nd() | 0;
                            if (!d) md(4040, b);
                            d = c[d >> 2] | 0;
                            if (!d) md(4040, b);
                            f = d + 48 | 0;
                            e = c[f >> 2] | 0;
                            f = c[f + 4 >> 2] | 0;
                            if (!((e & -256 | 0) == 1126902528 & (f | 0) == 1129074247)) {
                                c[b >> 2] = c[970];
                                md(4e3, b)
                            }
                            if ((e | 0) == 1126902529 & (f | 0) == 1129074247) e = c[d + 44 >> 2] | 0;
                            else e = d + 80 | 0;
                            c[a >> 2] = e;
                            f = c[d >> 2] | 0;
                            d = c[f + 4 >> 2] | 0;
                            if (eb[c[(c[4432 >> 2] | 0) + 16 >> 2] & 1](4432, f, a) | 0) {
                                f = c[a >> 2] | 0;
                                e = c[970] | 0;
                                f = ib[c[(c[f >> 2] | 0) + 8 >> 2] & 1](f) | 0;
                                c[b >> 2] = e;
                                c[b + 4 >> 2] = d;
                                c[b + 8 >> 2] = f;
                                md(3904, b)
                            } else {
                                c[b >> 2] = c[970];
                                c[b + 4 >> 2] = d;
                                md(3952, b)
                            }
                        }

                        function Qd() {
                            var a = 0;
                            a = i;
                            i = i + 16 | 0;
                            if (!(Ma(4056, 20) | 0)) { i = a; return } else md(4128, a)
                        }

                        function Rd(a) {
                            a = a | 0;
                            var b = 0;
                            b = i;
                            i = i + 16 | 0;
                            Td(a);
                            if (!(Pa(c[1014] | 0, 0) | 0)) { i = b; return } else md(4184, b)
                        }

                        function Sd(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0,
                                A = 0,
                                B = 0,
                                C = 0,
                                D = 0,
                                E = 0,
                                F = 0,
                                G = 0,
                                H = 0;
                            b = i;
                            do {
                                if (a >>> 0 < 245) {
                                    if (a >>> 0 < 11) a = 16;
                                    else a = a + 11 & -8;
                                    x = a >>> 3;
                                    p = c[1206] | 0;
                                    w = p >>> x;
                                    if (w & 3) {
                                        g = (w & 1 ^ 1) + x | 0;
                                        f = g << 1;
                                        d = 4864 + (f << 2) | 0;
                                        f = 4864 + (f + 2 << 2) | 0;
                                        h = c[f >> 2] | 0;
                                        j = h + 8 | 0;
                                        e = c[j >> 2] | 0;
                                        do {
                                            if ((d | 0) != (e | 0)) {
                                                if (e >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                k = e + 12 | 0;
                                                if ((c[k >> 2] | 0) == (h | 0)) {
                                                    c[k >> 2] = d;
                                                    c[f >> 2] = e;
                                                    break
                                                } else Wa()
                                            } else c[1206] = p & ~(1 << g)
                                        } while (0);
                                        H = g << 3;
                                        c[h + 4 >> 2] = H | 3;
                                        H = h + (H | 4) | 0;
                                        c[H >> 2] = c[H >> 2] | 1;
                                        H = j;
                                        i = b;
                                        return H | 0
                                    }
                                    v = c[1208] | 0;
                                    if (a >>> 0 > v >>> 0) {
                                        if (w) {
                                            h = 2 << x;
                                            h = w << x & (h | 0 - h);
                                            h = (h & 0 - h) + -1 | 0;
                                            d = h >>> 12 & 16;
                                            h = h >>> d;
                                            j = h >>> 5 & 8;
                                            h = h >>> j;
                                            f = h >>> 2 & 4;
                                            h = h >>> f;
                                            g = h >>> 1 & 2;
                                            h = h >>> g;
                                            e = h >>> 1 & 1;
                                            e = (j | d | f | g | e) + (h >>> e) | 0;
                                            h = e << 1;
                                            g = 4864 + (h << 2) | 0;
                                            h = 4864 + (h + 2 << 2) | 0;
                                            f = c[h >> 2] | 0;
                                            d = f + 8 | 0;
                                            j = c[d >> 2] | 0;
                                            do {
                                                if ((g | 0) != (j | 0)) {
                                                    if (j >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                    k = j + 12 | 0;
                                                    if ((c[k >> 2] | 0) == (f | 0)) {
                                                        c[k >> 2] = g;
                                                        c[h >> 2] = j;
                                                        E = c[1208] | 0;
                                                        break
                                                    } else Wa()
                                                } else {
                                                    c[1206] = p & ~(1 << e);
                                                    E = v
                                                }
                                            } while (0);
                                            H = e << 3;
                                            e = H - a | 0;
                                            c[f + 4 >> 2] = a | 3;
                                            g = f + a | 0;
                                            c[f + (a | 4) >> 2] = e | 1;
                                            c[f + H >> 2] = e;
                                            if (E) {
                                                f = c[1211] | 0;
                                                l = E >>> 3;
                                                j = l << 1;
                                                h = 4864 + (j << 2) | 0;
                                                k = c[1206] | 0;
                                                l = 1 << l;
                                                if (k & l) {
                                                    j = 4864 + (j + 2 << 2) | 0;
                                                    k = c[j >> 2] | 0;
                                                    if (k >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                    else {
                                                        D = j;
                                                        C = k
                                                    }
                                                } else {
                                                    c[1206] = k | l;
                                                    D = 4864 + (j + 2 << 2) | 0;
                                                    C = h
                                                }
                                                c[D >> 2] = f;
                                                c[C + 12 >> 2] = f;
                                                c[f + 8 >> 2] = C;
                                                c[f + 12 >> 2] = h
                                            }
                                            c[1208] = e;
                                            c[1211] = g;
                                            H = d;
                                            i = b;
                                            return H | 0
                                        }
                                        p = c[1207] | 0;
                                        if (p) {
                                            d = (p & 0 - p) + -1 | 0;
                                            G = d >>> 12 & 16;
                                            d = d >>> G;
                                            F = d >>> 5 & 8;
                                            d = d >>> F;
                                            H = d >>> 2 & 4;
                                            d = d >>> H;
                                            f = d >>> 1 & 2;
                                            d = d >>> f;
                                            e = d >>> 1 & 1;
                                            e = c[5128 + ((F | G | H | f | e) + (d >>> e) << 2) >> 2] | 0;
                                            d = (c[e + 4 >> 2] & -8) - a | 0;
                                            f = e;
                                            while (1) {
                                                g = c[f + 16 >> 2] | 0;
                                                if (!g) { g = c[f + 20 >> 2] | 0; if (!g) break }
                                                f = (c[g + 4 >> 2] & -8) - a | 0;
                                                H = f >>> 0 < d >>> 0;
                                                d = H ? f : d;
                                                f = g;
                                                e = H ? g : e
                                            }
                                            h = c[1210] | 0;
                                            if (e >>> 0 < h >>> 0) Wa();
                                            f = e + a | 0;
                                            if (e >>> 0 >= f >>> 0) Wa();
                                            g = c[e + 24 >> 2] | 0;
                                            k = c[e + 12 >> 2] | 0;
                                            do {
                                                if ((k | 0) == (e | 0)) {
                                                    k = e + 20 | 0;
                                                    j = c[k >> 2] | 0;
                                                    if (!j) {
                                                        k = e + 16 | 0;
                                                        j = c[k >> 2] | 0;
                                                        if (!j) { B = 0; break }
                                                    }
                                                    while (1) {
                                                        l = j + 20 | 0;
                                                        m = c[l >> 2] | 0;
                                                        if (m) {
                                                            j = m;
                                                            k = l;
                                                            continue
                                                        }
                                                        l = j + 16 | 0;
                                                        m = c[l >> 2] | 0;
                                                        if (!m) break;
                                                        else {
                                                            j = m;
                                                            k = l
                                                        }
                                                    }
                                                    if (k >>> 0 < h >>> 0) Wa();
                                                    else {
                                                        c[k >> 2] = 0;
                                                        B = j;
                                                        break
                                                    }
                                                } else {
                                                    j = c[e + 8 >> 2] | 0;
                                                    if (j >>> 0 < h >>> 0) Wa();
                                                    h = j + 12 | 0;
                                                    if ((c[h >> 2] | 0) != (e | 0)) Wa();
                                                    l = k + 8 | 0;
                                                    if ((c[l >> 2] | 0) == (e | 0)) {
                                                        c[h >> 2] = k;
                                                        c[l >> 2] = j;
                                                        B = k;
                                                        break
                                                    } else Wa()
                                                }
                                            } while (0);
                                            do {
                                                if (g) {
                                                    j = c[e + 28 >> 2] | 0;
                                                    h = 5128 + (j << 2) | 0;
                                                    if ((e | 0) == (c[h >> 2] | 0)) { c[h >> 2] = B; if (!B) { c[1207] = c[1207] & ~(1 << j); break } } else {
                                                        if (g >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                        h = g + 16 | 0;
                                                        if ((c[h >> 2] | 0) == (e | 0)) c[h >> 2] = B;
                                                        else c[g + 20 >> 2] = B;
                                                        if (!B) break
                                                    }
                                                    h = c[1210] | 0;
                                                    if (B >>> 0 < h >>> 0) Wa();
                                                    c[B + 24 >> 2] = g;
                                                    g = c[e + 16 >> 2] | 0;
                                                    do {
                                                        if (g)
                                                            if (g >>> 0 < h >>> 0) Wa();
                                                            else {
                                                                c[B + 16 >> 2] = g;
                                                                c[g + 24 >> 2] = B;
                                                                break
                                                            }
                                                    } while (0);
                                                    g = c[e + 20 >> 2] | 0;
                                                    if (g)
                                                        if (g >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                        else {
                                                            c[B + 20 >> 2] = g;
                                                            c[g + 24 >> 2] = B;
                                                            break
                                                        }
                                                }
                                            } while (0);
                                            if (d >>> 0 < 16) {
                                                H = d + a | 0;
                                                c[e + 4 >> 2] = H | 3;
                                                H = e + (H + 4) | 0;
                                                c[H >> 2] = c[H >> 2] | 1
                                            } else {
                                                c[e + 4 >> 2] = a | 3;
                                                c[e + (a | 4) >> 2] = d | 1;
                                                c[e + (d + a) >> 2] = d;
                                                h = c[1208] | 0;
                                                if (h) {
                                                    g = c[1211] | 0;
                                                    k = h >>> 3;
                                                    l = k << 1;
                                                    h = 4864 + (l << 2) | 0;
                                                    j = c[1206] | 0;
                                                    k = 1 << k;
                                                    if (j & k) {
                                                        j = 4864 + (l + 2 << 2) | 0;
                                                        k = c[j >> 2] | 0;
                                                        if (k >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                        else {
                                                            A = j;
                                                            z = k
                                                        }
                                                    } else {
                                                        c[1206] = j | k;
                                                        A = 4864 + (l + 2 << 2) | 0;
                                                        z = h
                                                    }
                                                    c[A >> 2] = g;
                                                    c[z + 12 >> 2] = g;
                                                    c[g + 8 >> 2] = z;
                                                    c[g + 12 >> 2] = h
                                                }
                                                c[1208] = d;
                                                c[1211] = f
                                            }
                                            H = e + 8 | 0;
                                            i = b;
                                            return H | 0
                                        }
                                    }
                                } else if (a >>> 0 <= 4294967231) {
                                    z = a + 11 | 0;
                                    a = z & -8;
                                    B = c[1207] | 0;
                                    if (B) {
                                        A = 0 - a | 0;
                                        z = z >>> 8;
                                        if (z)
                                            if (a >>> 0 > 16777215) C = 31;
                                            else {
                                                G = (z + 1048320 | 0) >>> 16 & 8;
                                                H = z << G;
                                                F = (H + 520192 | 0) >>> 16 & 4;
                                                H = H << F;
                                                C = (H + 245760 | 0) >>> 16 & 2;
                                                C = 14 - (F | G | C) + (H << C >>> 15) | 0;
                                                C = a >>> (C + 7 | 0) & 1 | C << 1
                                            }
                                        else C = 0;
                                        D = c[5128 + (C << 2) >> 2] | 0;
                                        a: do {
                                            if (!D) {
                                                F = 0;
                                                z = 0
                                            } else {
                                                if ((C | 0) == 31) z = 0;
                                                else z = 25 - (C >>> 1) | 0;
                                                F = 0;
                                                E = a << z;
                                                z = 0;
                                                while (1) {
                                                    G = c[D + 4 >> 2] & -8;
                                                    H = G - a | 0;
                                                    if (H >>> 0 < A >>> 0)
                                                        if ((G | 0) == (a | 0)) {
                                                            A = H;
                                                            F = D;
                                                            z = D;
                                                            break a
                                                        } else {
                                                            A = H;
                                                            z = D
                                                        }
                                                    H = c[D + 20 >> 2] | 0;
                                                    D = c[D + (E >>> 31 << 2) + 16 >> 2] | 0;
                                                    F = (H | 0) == 0 | (H | 0) == (D | 0) ? F : H;
                                                    if (!D) break;
                                                    else E = E << 1
                                                }
                                            }
                                        } while (0);
                                        if ((F | 0) == 0 & (z | 0) == 0) {
                                            H = 2 << C;
                                            B = B & (H | 0 - H);
                                            if (!B) break;
                                            H = (B & 0 - B) + -1 | 0;
                                            D = H >>> 12 & 16;
                                            H = H >>> D;
                                            C = H >>> 5 & 8;
                                            H = H >>> C;
                                            E = H >>> 2 & 4;
                                            H = H >>> E;
                                            G = H >>> 1 & 2;
                                            H = H >>> G;
                                            F = H >>> 1 & 1;
                                            F = c[5128 + ((C | D | E | G | F) + (H >>> F) << 2) >> 2] | 0
                                        }
                                        if (F)
                                            while (1) {
                                                H = (c[F + 4 >> 2] & -8) - a | 0;
                                                B = H >>> 0 < A >>> 0;
                                                A = B ? H : A;
                                                z = B ? F : z;
                                                B = c[F + 16 >> 2] | 0;
                                                if (B) { F = B; continue }
                                                F = c[F + 20 >> 2] | 0;
                                                if (!F) break
                                            }
                                        if ((z | 0) != 0 ? A >>> 0 < ((c[1208] | 0) - a | 0) >>> 0 : 0) {
                                            f = c[1210] | 0;
                                            if (z >>> 0 < f >>> 0) Wa();
                                            d = z + a | 0;
                                            if (z >>> 0 >= d >>> 0) Wa();
                                            e = c[z + 24 >> 2] | 0;
                                            g = c[z + 12 >> 2] | 0;
                                            do {
                                                if ((g | 0) == (z | 0)) {
                                                    h = z + 20 | 0;
                                                    g = c[h >> 2] | 0;
                                                    if (!g) {
                                                        h = z + 16 | 0;
                                                        g = c[h >> 2] | 0;
                                                        if (!g) { x = 0; break }
                                                    }
                                                    while (1) {
                                                        j = g + 20 | 0;
                                                        k = c[j >> 2] | 0;
                                                        if (k) {
                                                            g = k;
                                                            h = j;
                                                            continue
                                                        }
                                                        j = g + 16 | 0;
                                                        k = c[j >> 2] | 0;
                                                        if (!k) break;
                                                        else {
                                                            g = k;
                                                            h = j
                                                        }
                                                    }
                                                    if (h >>> 0 < f >>> 0) Wa();
                                                    else {
                                                        c[h >> 2] = 0;
                                                        x = g;
                                                        break
                                                    }
                                                } else {
                                                    h = c[z + 8 >> 2] | 0;
                                                    if (h >>> 0 < f >>> 0) Wa();
                                                    j = h + 12 | 0;
                                                    if ((c[j >> 2] | 0) != (z | 0)) Wa();
                                                    f = g + 8 | 0;
                                                    if ((c[f >> 2] | 0) == (z | 0)) {
                                                        c[j >> 2] = g;
                                                        c[f >> 2] = h;
                                                        x = g;
                                                        break
                                                    } else Wa()
                                                }
                                            } while (0);
                                            do {
                                                if (e) {
                                                    f = c[z + 28 >> 2] | 0;
                                                    g = 5128 + (f << 2) | 0;
                                                    if ((z | 0) == (c[g >> 2] | 0)) { c[g >> 2] = x; if (!x) { c[1207] = c[1207] & ~(1 << f); break } } else {
                                                        if (e >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                        f = e + 16 | 0;
                                                        if ((c[f >> 2] | 0) == (z | 0)) c[f >> 2] = x;
                                                        else c[e + 20 >> 2] = x;
                                                        if (!x) break
                                                    }
                                                    f = c[1210] | 0;
                                                    if (x >>> 0 < f >>> 0) Wa();
                                                    c[x + 24 >> 2] = e;
                                                    e = c[z + 16 >> 2] | 0;
                                                    do {
                                                        if (e)
                                                            if (e >>> 0 < f >>> 0) Wa();
                                                            else {
                                                                c[x + 16 >> 2] = e;
                                                                c[e + 24 >> 2] = x;
                                                                break
                                                            }
                                                    } while (0);
                                                    e = c[z + 20 >> 2] | 0;
                                                    if (e)
                                                        if (e >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                        else {
                                                            c[x + 20 >> 2] = e;
                                                            c[e + 24 >> 2] = x;
                                                            break
                                                        }
                                                }
                                            } while (0);
                                            b: do {
                                                if (A >>> 0 >= 16) {
                                                    c[z + 4 >> 2] = a | 3;
                                                    c[z + (a | 4) >> 2] = A | 1;
                                                    c[z + (A + a) >> 2] = A;
                                                    f = A >>> 3;
                                                    if (A >>> 0 < 256) {
                                                        h = f << 1;
                                                        e = 4864 + (h << 2) | 0;
                                                        g = c[1206] | 0;
                                                        f = 1 << f;
                                                        do {
                                                            if (!(g & f)) {
                                                                c[1206] = g | f;
                                                                w = 4864 + (h + 2 << 2) | 0;
                                                                v = e
                                                            } else {
                                                                f = 4864 + (h + 2 << 2) | 0;
                                                                g = c[f >> 2] | 0;
                                                                if (g >>> 0 >= (c[1210] | 0) >>> 0) {
                                                                    w = f;
                                                                    v = g;
                                                                    break
                                                                }
                                                                Wa()
                                                            }
                                                        } while (0);
                                                        c[w >> 2] = d;
                                                        c[v + 12 >> 2] = d;
                                                        c[z + (a + 8) >> 2] = v;
                                                        c[z + (a + 12) >> 2] = e;
                                                        break
                                                    }
                                                    e = A >>> 8;
                                                    if (e)
                                                        if (A >>> 0 > 16777215) e = 31;
                                                        else {
                                                            G = (e + 1048320 | 0) >>> 16 & 8;
                                                            H = e << G;
                                                            F = (H + 520192 | 0) >>> 16 & 4;
                                                            H = H << F;
                                                            e = (H + 245760 | 0) >>> 16 & 2;
                                                            e = 14 - (F | G | e) + (H << e >>> 15) | 0;
                                                            e = A >>> (e + 7 | 0) & 1 | e << 1
                                                        }
                                                    else e = 0;
                                                    f = 5128 + (e << 2) | 0;
                                                    c[z + (a + 28) >> 2] = e;
                                                    c[z + (a + 20) >> 2] = 0;
                                                    c[z + (a + 16) >> 2] = 0;
                                                    g = c[1207] | 0;
                                                    h = 1 << e;
                                                    if (!(g & h)) {
                                                        c[1207] = g | h;
                                                        c[f >> 2] = d;
                                                        c[z + (a + 24) >> 2] = f;
                                                        c[z + (a + 12) >> 2] = d;
                                                        c[z + (a + 8) >> 2] = d;
                                                        break
                                                    }
                                                    h = c[f >> 2] | 0;
                                                    if ((e | 0) == 31) e = 0;
                                                    else e = 25 - (e >>> 1) | 0;
                                                    c: do {
                                                        if ((c[h + 4 >> 2] & -8 | 0) != (A | 0)) {
                                                            e = A << e;
                                                            while (1) {
                                                                g = h + (e >>> 31 << 2) + 16 | 0;
                                                                f = c[g >> 2] | 0;
                                                                if (!f) break;
                                                                if ((c[f + 4 >> 2] & -8 | 0) == (A | 0)) { p = f; break c } else {
                                                                    e = e << 1;
                                                                    h = f
                                                                }
                                                            }
                                                            if (g >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                            else {
                                                                c[g >> 2] = d;
                                                                c[z + (a + 24) >> 2] = h;
                                                                c[z + (a + 12) >> 2] = d;
                                                                c[z + (a + 8) >> 2] = d;
                                                                break b
                                                            }
                                                        } else p = h
                                                    } while (0);
                                                    f = p + 8 | 0;
                                                    e = c[f >> 2] | 0;
                                                    H = c[1210] | 0;
                                                    if (p >>> 0 >= H >>> 0 & e >>> 0 >= H >>> 0) {
                                                        c[e + 12 >> 2] = d;
                                                        c[f >> 2] = d;
                                                        c[z + (a + 8) >> 2] = e;
                                                        c[z + (a + 12) >> 2] = p;
                                                        c[z + (a + 24) >> 2] = 0;
                                                        break
                                                    } else Wa()
                                                } else {
                                                    H = A + a | 0;
                                                    c[z + 4 >> 2] = H | 3;
                                                    H = z + (H + 4) | 0;
                                                    c[H >> 2] = c[H >> 2] | 1
                                                }
                                            } while (0);
                                            H = z + 8 | 0;
                                            i = b;
                                            return H | 0
                                        }
                                    }
                                } else a = -1
                            } while (0);
                            p = c[1208] | 0;
                            if (p >>> 0 >= a >>> 0) {
                                e = p - a | 0;
                                d = c[1211] | 0;
                                if (e >>> 0 > 15) {
                                    c[1211] = d + a;
                                    c[1208] = e;
                                    c[d + (a + 4) >> 2] = e | 1;
                                    c[d + p >> 2] = e;
                                    c[d + 4 >> 2] = a | 3
                                } else {
                                    c[1208] = 0;
                                    c[1211] = 0;
                                    c[d + 4 >> 2] = p | 3;
                                    H = d + (p + 4) | 0;
                                    c[H >> 2] = c[H >> 2] | 1
                                }
                                H = d + 8 | 0;
                                i = b;
                                return H | 0
                            }
                            p = c[1209] | 0;
                            if (p >>> 0 > a >>> 0) {
                                G = p - a | 0;
                                c[1209] = G;
                                H = c[1212] | 0;
                                c[1212] = H + a;
                                c[H + (a + 4) >> 2] = G | 1;
                                c[H + 4 >> 2] = a | 3;
                                H = H + 8 | 0;
                                i = b;
                                return H | 0
                            }
                            do {
                                if (!(c[1324] | 0)) {
                                    p = Ga(30) | 0;
                                    if (!(p + -1 & p)) {
                                        c[1326] = p;
                                        c[1325] = p;
                                        c[1327] = -1;
                                        c[1328] = -1;
                                        c[1329] = 0;
                                        c[1317] = 0;
                                        c[1324] = (Ya(0) | 0) & -16 ^ 1431655768;
                                        break
                                    } else Wa()
                                }
                            } while (0);
                            x = a + 48 | 0;
                            p = c[1326] | 0;
                            w = a + 47 | 0;
                            A = p + w | 0;
                            p = 0 - p | 0;
                            v = A & p;
                            if (v >>> 0 <= a >>> 0) {
                                H = 0;
                                i = b;
                                return H | 0
                            }
                            z = c[1316] | 0;
                            if ((z | 0) != 0 ? (G = c[1314] | 0, H = G + v | 0, H >>> 0 <= G >>> 0 | H >>> 0 > z >>> 0) : 0) {
                                H = 0;
                                i = b;
                                return H | 0
                            }
                            d: do {
                                if (!(c[1317] & 4)) {
                                    B = c[1212] | 0;
                                    e: do {
                                        if (B) {
                                            z = 5272 | 0;
                                            while (1) {
                                                C = c[z >> 2] | 0;
                                                if (C >>> 0 <= B >>> 0 ? (y = z + 4 | 0, (C + (c[y >> 2] | 0) | 0) >>> 0 > B >>> 0) : 0) break;
                                                z = c[z + 8 >> 2] | 0;
                                                if (!z) { o = 181; break e }
                                            }
                                            if (z) {
                                                A = A - (c[1209] | 0) & p;
                                                if (A >>> 0 < 2147483647) {
                                                    p = Aa(A | 0) | 0;
                                                    if ((p | 0) == ((c[z >> 2] | 0) + (c[y >> 2] | 0) | 0)) {
                                                        z = A;
                                                        o = 190
                                                    } else {
                                                        z = A;
                                                        o = 191
                                                    }
                                                } else z = 0
                                            } else o = 181
                                        } else o = 181
                                    } while (0);
                                    do {
                                        if ((o | 0) == 181) {
                                            y = Aa(0) | 0;
                                            if ((y | 0) != (-1 | 0)) {
                                                A = y;
                                                z = c[1325] | 0;
                                                p = z + -1 | 0;
                                                if (!(p & A)) z = v;
                                                else z = v - A + (p + A & 0 - z) | 0;
                                                p = c[1314] | 0;
                                                A = p + z | 0;
                                                if (z >>> 0 > a >>> 0 & z >>> 0 < 2147483647) {
                                                    H = c[1316] | 0;
                                                    if ((H | 0) != 0 ? A >>> 0 <= p >>> 0 | A >>> 0 > H >>> 0 : 0) { z = 0; break }
                                                    p = Aa(z | 0) | 0;
                                                    if ((p | 0) == (y | 0)) {
                                                        p = y;
                                                        o = 190
                                                    } else o = 191
                                                } else z = 0
                                            } else z = 0
                                        }
                                    } while (0);
                                    f: do {
                                        if ((o | 0) == 190) {
                                            if ((p | 0) != (-1 | 0)) {
                                                q = z;
                                                o = 201;
                                                break d
                                            }
                                        } else if ((o | 0) == 191) {
                                            o = 0 - z | 0;
                                            do {
                                                if ((p | 0) != (-1 | 0) & z >>> 0 < 2147483647 & x >>> 0 > z >>> 0 ? (u = c[1326] | 0, u = w - z + u & 0 - u, u >>> 0 < 2147483647) : 0)
                                                    if ((Aa(u | 0) | 0) == (-1 | 0)) {
                                                        Aa(o | 0) | 0;
                                                        z = 0;
                                                        break f
                                                    } else { z = u + z | 0; break }
                                            } while (0);
                                            if ((p | 0) == (-1 | 0)) z = 0;
                                            else {
                                                q = z;
                                                o = 201;
                                                break d
                                            }
                                        }
                                    } while (0);
                                    c[1317] = c[1317] | 4;
                                    o = 198
                                } else {
                                    z = 0;
                                    o = 198
                                }
                            } while (0);
                            if ((((o | 0) == 198 ? v >>> 0 < 2147483647 : 0) ? (t = Aa(v | 0) | 0, s = Aa(0) | 0, (t | 0) != (-1 | 0) & (s | 0) != (-1 | 0) & t >>> 0 < s >>> 0) : 0) ? (r = s - t | 0, q = r >>> 0 > (a + 40 | 0) >>> 0, q) : 0) {
                                p = t;
                                q = q ? r : z;
                                o = 201
                            }
                            if ((o | 0) == 201) {
                                r = (c[1314] | 0) + q | 0;
                                c[1314] = r;
                                if (r >>> 0 > (c[1315] | 0) >>> 0) c[1315] = r;
                                r = c[1212] | 0;
                                g: do {
                                    if (r) {
                                        t = 5272 | 0;
                                        while (1) {
                                            s = c[t >> 2] | 0;
                                            v = t + 4 | 0;
                                            w = c[v >> 2] | 0;
                                            if ((p | 0) == (s + w | 0)) { o = 213; break }
                                            u = c[t + 8 >> 2] | 0;
                                            if (!u) break;
                                            else t = u
                                        }
                                        if (((o | 0) == 213 ? (c[t + 12 >> 2] & 8 | 0) == 0 : 0) ? r >>> 0 >= s >>> 0 & r >>> 0 < p >>> 0 : 0) {
                                            c[v >> 2] = w + q;
                                            d = (c[1209] | 0) + q | 0;
                                            e = r + 8 | 0;
                                            if (!(e & 7)) e = 0;
                                            else e = 0 - e & 7;
                                            H = d - e | 0;
                                            c[1212] = r + e;
                                            c[1209] = H;
                                            c[r + (e + 4) >> 2] = H | 1;
                                            c[r + (d + 4) >> 2] = 40;
                                            c[1213] = c[1328];
                                            break
                                        }
                                        s = c[1210] | 0;
                                        if (p >>> 0 < s >>> 0) {
                                            c[1210] = p;
                                            s = p
                                        }
                                        v = p + q | 0;
                                        t = 5272 | 0;
                                        while (1) {
                                            if ((c[t >> 2] | 0) == (v | 0)) { o = 223; break }
                                            u = c[t + 8 >> 2] | 0;
                                            if (!u) break;
                                            else t = u
                                        }
                                        if ((o | 0) == 223 ? (c[t + 12 >> 2] & 8 | 0) == 0 : 0) {
                                            c[t >> 2] = p;
                                            h = t + 4 | 0;
                                            c[h >> 2] = (c[h >> 2] | 0) + q;
                                            h = p + 8 | 0;
                                            if (!(h & 7)) h = 0;
                                            else h = 0 - h & 7;
                                            j = p + (q + 8) | 0;
                                            if (!(j & 7)) n = 0;
                                            else n = 0 - j & 7;
                                            o = p + (n + q) | 0;
                                            k = h + a | 0;
                                            j = p + k | 0;
                                            m = o - (p + h) - a | 0;
                                            c[p + (h + 4) >> 2] = a | 3;
                                            h: do {
                                                if ((o | 0) != (r | 0)) {
                                                    if ((o | 0) == (c[1211] | 0)) {
                                                        H = (c[1208] | 0) + m | 0;
                                                        c[1208] = H;
                                                        c[1211] = j;
                                                        c[p + (k + 4) >> 2] = H | 1;
                                                        c[p + (H + k) >> 2] = H;
                                                        break
                                                    }
                                                    r = q + 4 | 0;
                                                    u = c[p + (r + n) >> 2] | 0;
                                                    if ((u & 3 | 0) == 1) {
                                                        a = u & -8;
                                                        t = u >>> 3;
                                                        i: do {
                                                            if (u >>> 0 >= 256) {
                                                                l = c[p + ((n | 24) + q) >> 2] | 0;
                                                                t = c[p + (q + 12 + n) >> 2] | 0;
                                                                do {
                                                                    if ((t | 0) == (o | 0)) {
                                                                        v = n | 16;
                                                                        u = p + (r + v) | 0;
                                                                        t = c[u >> 2] | 0;
                                                                        if (!t) {
                                                                            u = p + (v + q) | 0;
                                                                            t = c[u >> 2] | 0;
                                                                            if (!t) { g = 0; break }
                                                                        }
                                                                        while (1) {
                                                                            w = t + 20 | 0;
                                                                            v = c[w >> 2] | 0;
                                                                            if (v) {
                                                                                t = v;
                                                                                u = w;
                                                                                continue
                                                                            }
                                                                            w = t + 16 | 0;
                                                                            v = c[w >> 2] | 0;
                                                                            if (!v) break;
                                                                            else {
                                                                                t = v;
                                                                                u = w
                                                                            }
                                                                        }
                                                                        if (u >>> 0 < s >>> 0) Wa();
                                                                        else {
                                                                            c[u >> 2] = 0;
                                                                            g = t;
                                                                            break
                                                                        }
                                                                    } else {
                                                                        u = c[p + ((n | 8) + q) >> 2] | 0;
                                                                        if (u >>> 0 < s >>> 0) Wa();
                                                                        v = u + 12 | 0;
                                                                        if ((c[v >> 2] | 0) != (o | 0)) Wa();
                                                                        s = t + 8 | 0;
                                                                        if ((c[s >> 2] | 0) == (o | 0)) {
                                                                            c[v >> 2] = t;
                                                                            c[s >> 2] = u;
                                                                            g = t;
                                                                            break
                                                                        } else Wa()
                                                                    }
                                                                } while (0);
                                                                if (!l) break;
                                                                s = c[p + (q + 28 + n) >> 2] | 0;
                                                                t = 5128 + (s << 2) | 0;
                                                                do {
                                                                    if ((o | 0) != (c[t >> 2] | 0)) {
                                                                        if (l >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                                        s = l + 16 | 0;
                                                                        if ((c[s >> 2] | 0) == (o | 0)) c[s >> 2] = g;
                                                                        else c[l + 20 >> 2] = g;
                                                                        if (!g) break i
                                                                    } else {
                                                                        c[t >> 2] = g;
                                                                        if (g) break;
                                                                        c[1207] = c[1207] & ~(1 << s);
                                                                        break i
                                                                    }
                                                                } while (0);
                                                                o = c[1210] | 0;
                                                                if (g >>> 0 < o >>> 0) Wa();
                                                                c[g + 24 >> 2] = l;
                                                                s = n | 16;
                                                                l = c[p + (s + q) >> 2] | 0;
                                                                do {
                                                                    if (l)
                                                                        if (l >>> 0 < o >>> 0) Wa();
                                                                        else {
                                                                            c[g + 16 >> 2] = l;
                                                                            c[l + 24 >> 2] = g;
                                                                            break
                                                                        }
                                                                } while (0);
                                                                l = c[p + (r + s) >> 2] | 0;
                                                                if (!l) break;
                                                                if (l >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                                else {
                                                                    c[g + 20 >> 2] = l;
                                                                    c[l + 24 >> 2] = g;
                                                                    break
                                                                }
                                                            } else {
                                                                g = c[p + ((n | 8) + q) >> 2] | 0;
                                                                r = c[p + (q + 12 + n) >> 2] | 0;
                                                                u = 4864 + (t << 1 << 2) | 0;
                                                                do {
                                                                    if ((g | 0) != (u | 0)) {
                                                                        if (g >>> 0 < s >>> 0) Wa();
                                                                        if ((c[g + 12 >> 2] | 0) == (o | 0)) break;
                                                                        Wa()
                                                                    }
                                                                } while (0);
                                                                if ((r | 0) == (g | 0)) { c[1206] = c[1206] & ~(1 << t); break }
                                                                do {
                                                                    if ((r | 0) == (u | 0)) l = r + 8 | 0;
                                                                    else {
                                                                        if (r >>> 0 < s >>> 0) Wa();
                                                                        s = r + 8 | 0;
                                                                        if ((c[s >> 2] | 0) == (o | 0)) { l = s; break }
                                                                        Wa()
                                                                    }
                                                                } while (0);
                                                                c[g + 12 >> 2] = r;
                                                                c[l >> 2] = g
                                                            }
                                                        } while (0);
                                                        o = p + ((a | n) + q) | 0;
                                                        m = a + m | 0
                                                    }
                                                    g = o + 4 | 0;
                                                    c[g >> 2] = c[g >> 2] & -2;
                                                    c[p + (k + 4) >> 2] = m | 1;
                                                    c[p + (m + k) >> 2] = m;
                                                    g = m >>> 3;
                                                    if (m >>> 0 < 256) {
                                                        l = g << 1;
                                                        d = 4864 + (l << 2) | 0;
                                                        m = c[1206] | 0;
                                                        g = 1 << g;
                                                        do {
                                                            if (!(m & g)) {
                                                                c[1206] = m | g;
                                                                f = 4864 + (l + 2 << 2) | 0;
                                                                e = d
                                                            } else {
                                                                l = 4864 + (l + 2 << 2) | 0;
                                                                g = c[l >> 2] | 0;
                                                                if (g >>> 0 >= (c[1210] | 0) >>> 0) {
                                                                    f = l;
                                                                    e = g;
                                                                    break
                                                                }
                                                                Wa()
                                                            }
                                                        } while (0);
                                                        c[f >> 2] = j;
                                                        c[e + 12 >> 2] = j;
                                                        c[p + (k + 8) >> 2] = e;
                                                        c[p + (k + 12) >> 2] = d;
                                                        break
                                                    }
                                                    e = m >>> 8;
                                                    do {
                                                        if (!e) e = 0;
                                                        else {
                                                            if (m >>> 0 > 16777215) { e = 31; break }
                                                            G = (e + 1048320 | 0) >>> 16 & 8;
                                                            H = e << G;
                                                            F = (H + 520192 | 0) >>> 16 & 4;
                                                            H = H << F;
                                                            e = (H + 245760 | 0) >>> 16 & 2;
                                                            e = 14 - (F | G | e) + (H << e >>> 15) | 0;
                                                            e = m >>> (e + 7 | 0) & 1 | e << 1
                                                        }
                                                    } while (0);
                                                    l = 5128 + (e << 2) | 0;
                                                    c[p + (k + 28) >> 2] = e;
                                                    c[p + (k + 20) >> 2] = 0;
                                                    c[p + (k + 16) >> 2] = 0;
                                                    g = c[1207] | 0;
                                                    f = 1 << e;
                                                    if (!(g & f)) {
                                                        c[1207] = g | f;
                                                        c[l >> 2] = j;
                                                        c[p + (k + 24) >> 2] = l;
                                                        c[p + (k + 12) >> 2] = j;
                                                        c[p + (k + 8) >> 2] = j;
                                                        break
                                                    }
                                                    f = c[l >> 2] | 0;
                                                    if ((e | 0) == 31) e = 0;
                                                    else e = 25 - (e >>> 1) | 0;
                                                    j: do {
                                                        if ((c[f + 4 >> 2] & -8 | 0) != (m | 0)) {
                                                            e = m << e;
                                                            while (1) {
                                                                g = f + (e >>> 31 << 2) + 16 | 0;
                                                                l = c[g >> 2] | 0;
                                                                if (!l) break;
                                                                if ((c[l + 4 >> 2] & -8 | 0) == (m | 0)) { d = l; break j } else {
                                                                    e = e << 1;
                                                                    f = l
                                                                }
                                                            }
                                                            if (g >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                            else {
                                                                c[g >> 2] = j;
                                                                c[p + (k + 24) >> 2] = f;
                                                                c[p + (k + 12) >> 2] = j;
                                                                c[p + (k + 8) >> 2] = j;
                                                                break h
                                                            }
                                                        } else d = f
                                                    } while (0);
                                                    e = d + 8 | 0;
                                                    f = c[e >> 2] | 0;
                                                    H = c[1210] | 0;
                                                    if (d >>> 0 >= H >>> 0 & f >>> 0 >= H >>> 0) {
                                                        c[f + 12 >> 2] = j;
                                                        c[e >> 2] = j;
                                                        c[p + (k + 8) >> 2] = f;
                                                        c[p + (k + 12) >> 2] = d;
                                                        c[p + (k + 24) >> 2] = 0;
                                                        break
                                                    } else Wa()
                                                } else {
                                                    H = (c[1209] | 0) + m | 0;
                                                    c[1209] = H;
                                                    c[1212] = j;
                                                    c[p + (k + 4) >> 2] = H | 1
                                                }
                                            } while (0);
                                            H = p + (h | 8) | 0;
                                            i = b;
                                            return H | 0
                                        }
                                        e = 5272 | 0;
                                        while (1) {
                                            d = c[e >> 2] | 0;
                                            if (d >>> 0 <= r >>> 0 ? (n = c[e + 4 >> 2] | 0, m = d + n | 0, m >>> 0 > r >>> 0) : 0) break;
                                            e = c[e + 8 >> 2] | 0
                                        }
                                        e = d + (n + -39) | 0;
                                        if (!(e & 7)) e = 0;
                                        else e = 0 - e & 7;
                                        d = d + (n + -47 + e) | 0;
                                        d = d >>> 0 < (r + 16 | 0) >>> 0 ? r : d;
                                        e = d + 8 | 0;
                                        f = p + 8 | 0;
                                        if (!(f & 7)) f = 0;
                                        else f = 0 - f & 7;
                                        H = q + -40 - f | 0;
                                        c[1212] = p + f;
                                        c[1209] = H;
                                        c[p + (f + 4) >> 2] = H | 1;
                                        c[p + (q + -36) >> 2] = 40;
                                        c[1213] = c[1328];
                                        c[d + 4 >> 2] = 27;
                                        c[e + 0 >> 2] = c[1318];
                                        c[e + 4 >> 2] = c[1319];
                                        c[e + 8 >> 2] = c[1320];
                                        c[e + 12 >> 2] = c[1321];
                                        c[1318] = p;
                                        c[1319] = q;
                                        c[1321] = 0;
                                        c[1320] = e;
                                        e = d + 28 | 0;
                                        c[e >> 2] = 7;
                                        if ((d + 32 | 0) >>> 0 < m >>> 0)
                                            do {
                                                H = e;
                                                e = e + 4 | 0;
                                                c[e >> 2] = 7
                                            } while ((H + 8 | 0) >>> 0 < m >>> 0);
                                        if ((d | 0) != (r | 0)) {
                                            d = d - r | 0;
                                            e = r + (d + 4) | 0;
                                            c[e >> 2] = c[e >> 2] & -2;
                                            c[r + 4 >> 2] = d | 1;
                                            c[r + d >> 2] = d;
                                            e = d >>> 3;
                                            if (d >>> 0 < 256) {
                                                f = e << 1;
                                                d = 4864 + (f << 2) | 0;
                                                g = c[1206] | 0;
                                                e = 1 << e;
                                                do {
                                                    if (!(g & e)) {
                                                        c[1206] = g | e;
                                                        k = 4864 + (f + 2 << 2) | 0;
                                                        j = d
                                                    } else {
                                                        f = 4864 + (f + 2 << 2) | 0;
                                                        e = c[f >> 2] | 0;
                                                        if (e >>> 0 >= (c[1210] | 0) >>> 0) {
                                                            k = f;
                                                            j = e;
                                                            break
                                                        }
                                                        Wa()
                                                    }
                                                } while (0);
                                                c[k >> 2] = r;
                                                c[j + 12 >> 2] = r;
                                                c[r + 8 >> 2] = j;
                                                c[r + 12 >> 2] = d;
                                                break
                                            }
                                            e = d >>> 8;
                                            if (e)
                                                if (d >>> 0 > 16777215) e = 31;
                                                else {
                                                    G = (e + 1048320 | 0) >>> 16 & 8;
                                                    H = e << G;
                                                    F = (H + 520192 | 0) >>> 16 & 4;
                                                    H = H << F;
                                                    e = (H + 245760 | 0) >>> 16 & 2;
                                                    e = 14 - (F | G | e) + (H << e >>> 15) | 0;
                                                    e = d >>> (e + 7 | 0) & 1 | e << 1
                                                }
                                            else e = 0;
                                            j = 5128 + (e << 2) | 0;
                                            c[r + 28 >> 2] = e;
                                            c[r + 20 >> 2] = 0;
                                            c[r + 16 >> 2] = 0;
                                            f = c[1207] | 0;
                                            g = 1 << e;
                                            if (!(f & g)) {
                                                c[1207] = f | g;
                                                c[j >> 2] = r;
                                                c[r + 24 >> 2] = j;
                                                c[r + 12 >> 2] = r;
                                                c[r + 8 >> 2] = r;
                                                break
                                            }
                                            f = c[j >> 2] | 0;
                                            if ((e | 0) == 31) e = 0;
                                            else e = 25 - (e >>> 1) | 0;
                                            k: do {
                                                if ((c[f + 4 >> 2] & -8 | 0) != (d | 0)) {
                                                    e = d << e;
                                                    j = f;
                                                    while (1) {
                                                        f = j + (e >>> 31 << 2) + 16 | 0;
                                                        g = c[f >> 2] | 0;
                                                        if (!g) break;
                                                        if ((c[g + 4 >> 2] & -8 | 0) == (d | 0)) { h = g; break k } else {
                                                            e = e << 1;
                                                            j = g
                                                        }
                                                    }
                                                    if (f >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                    else {
                                                        c[f >> 2] = r;
                                                        c[r + 24 >> 2] = j;
                                                        c[r + 12 >> 2] = r;
                                                        c[r + 8 >> 2] = r;
                                                        break g
                                                    }
                                                } else h = f
                                            } while (0);
                                            e = h + 8 | 0;
                                            d = c[e >> 2] | 0;
                                            H = c[1210] | 0;
                                            if (h >>> 0 >= H >>> 0 & d >>> 0 >= H >>> 0) {
                                                c[d + 12 >> 2] = r;
                                                c[e >> 2] = r;
                                                c[r + 8 >> 2] = d;
                                                c[r + 12 >> 2] = h;
                                                c[r + 24 >> 2] = 0;
                                                break
                                            } else Wa()
                                        }
                                    } else {
                                        H = c[1210] | 0;
                                        if ((H | 0) == 0 | p >>> 0 < H >>> 0) c[1210] = p;
                                        c[1318] = p;
                                        c[1319] = q;
                                        c[1321] = 0;
                                        c[1215] = c[1324];
                                        c[1214] = -1;
                                        d = 0;
                                        do {
                                            H = d << 1;
                                            G = 4864 + (H << 2) | 0;
                                            c[4864 + (H + 3 << 2) >> 2] = G;
                                            c[4864 + (H + 2 << 2) >> 2] = G;
                                            d = d + 1 | 0
                                        } while ((d | 0) != 32);
                                        d = p + 8 | 0;
                                        if (!(d & 7)) d = 0;
                                        else d = 0 - d & 7;
                                        H = q + -40 - d | 0;
                                        c[1212] = p + d;
                                        c[1209] = H;
                                        c[p + (d + 4) >> 2] = H | 1;
                                        c[p + (q + -36) >> 2] = 40;
                                        c[1213] = c[1328]
                                    }
                                } while (0);
                                d = c[1209] | 0;
                                if (d >>> 0 > a >>> 0) {
                                    G = d - a | 0;
                                    c[1209] = G;
                                    H = c[1212] | 0;
                                    c[1212] = H + a;
                                    c[H + (a + 4) >> 2] = G | 1;
                                    c[H + 4 >> 2] = a | 3;
                                    H = H + 8 | 0;
                                    i = b;
                                    return H | 0
                                }
                            }
                            c[(Oa() | 0) >> 2] = 12;
                            H = 0;
                            i = b;
                            return H | 0
                        }

                        function Td(a) {
                            a = a | 0;
                            var b = 0,
                                d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0,
                                w = 0;
                            b = i;
                            if (!a) { i = b; return }
                            q = a + -8 | 0;
                            r = c[1210] | 0;
                            if (q >>> 0 < r >>> 0) Wa();
                            n = c[a + -4 >> 2] | 0;
                            m = n & 3;
                            if ((m | 0) == 1) Wa();
                            j = n & -8;
                            h = a + (j + -8) | 0;
                            do {
                                if (!(n & 1)) {
                                    u = c[q >> 2] | 0;
                                    if (!m) { i = b; return }
                                    q = -8 - u | 0;
                                    n = a + q | 0;
                                    m = u + j | 0;
                                    if (n >>> 0 < r >>> 0) Wa();
                                    if ((n | 0) == (c[1211] | 0)) {
                                        e = a + (j + -4) | 0;
                                        o = c[e >> 2] | 0;
                                        if ((o & 3 | 0) != 3) {
                                            e = n;
                                            o = m;
                                            break
                                        }
                                        c[1208] = m;
                                        c[e >> 2] = o & -2;
                                        c[a + (q + 4) >> 2] = m | 1;
                                        c[h >> 2] = m;
                                        i = b;
                                        return
                                    }
                                    t = u >>> 3;
                                    if (u >>> 0 < 256) {
                                        e = c[a + (q + 8) >> 2] | 0;
                                        o = c[a + (q + 12) >> 2] | 0;
                                        p = 4864 + (t << 1 << 2) | 0;
                                        if ((e | 0) != (p | 0)) { if (e >>> 0 < r >>> 0) Wa(); if ((c[e + 12 >> 2] | 0) != (n | 0)) Wa() }
                                        if ((o | 0) == (e | 0)) {
                                            c[1206] = c[1206] & ~(1 << t);
                                            e = n;
                                            o = m;
                                            break
                                        }
                                        if ((o | 0) != (p | 0)) {
                                            if (o >>> 0 < r >>> 0) Wa();
                                            p = o + 8 | 0;
                                            if ((c[p >> 2] | 0) == (n | 0)) s = p;
                                            else Wa()
                                        } else s = o + 8 | 0;
                                        c[e + 12 >> 2] = o;
                                        c[s >> 2] = e;
                                        e = n;
                                        o = m;
                                        break
                                    }
                                    s = c[a + (q + 24) >> 2] | 0;
                                    t = c[a + (q + 12) >> 2] | 0;
                                    do {
                                        if ((t | 0) == (n | 0)) {
                                            u = a + (q + 20) | 0;
                                            t = c[u >> 2] | 0;
                                            if (!t) {
                                                u = a + (q + 16) | 0;
                                                t = c[u >> 2] | 0;
                                                if (!t) { p = 0; break }
                                            }
                                            while (1) {
                                                v = t + 20 | 0;
                                                w = c[v >> 2] | 0;
                                                if (w) {
                                                    t = w;
                                                    u = v;
                                                    continue
                                                }
                                                v = t + 16 | 0;
                                                w = c[v >> 2] | 0;
                                                if (!w) break;
                                                else {
                                                    t = w;
                                                    u = v
                                                }
                                            }
                                            if (u >>> 0 < r >>> 0) Wa();
                                            else {
                                                c[u >> 2] = 0;
                                                p = t;
                                                break
                                            }
                                        } else {
                                            u = c[a + (q + 8) >> 2] | 0;
                                            if (u >>> 0 < r >>> 0) Wa();
                                            r = u + 12 | 0;
                                            if ((c[r >> 2] | 0) != (n | 0)) Wa();
                                            v = t + 8 | 0;
                                            if ((c[v >> 2] | 0) == (n | 0)) {
                                                c[r >> 2] = t;
                                                c[v >> 2] = u;
                                                p = t;
                                                break
                                            } else Wa()
                                        }
                                    } while (0);
                                    if (s) {
                                        r = c[a + (q + 28) >> 2] | 0;
                                        t = 5128 + (r << 2) | 0;
                                        if ((n | 0) == (c[t >> 2] | 0)) {
                                            c[t >> 2] = p;
                                            if (!p) {
                                                c[1207] = c[1207] & ~(1 << r);
                                                e = n;
                                                o = m;
                                                break
                                            }
                                        } else {
                                            if (s >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                            r = s + 16 | 0;
                                            if ((c[r >> 2] | 0) == (n | 0)) c[r >> 2] = p;
                                            else c[s + 20 >> 2] = p;
                                            if (!p) {
                                                e = n;
                                                o = m;
                                                break
                                            }
                                        }
                                        r = c[1210] | 0;
                                        if (p >>> 0 < r >>> 0) Wa();
                                        c[p + 24 >> 2] = s;
                                        s = c[a + (q + 16) >> 2] | 0;
                                        do {
                                            if (s)
                                                if (s >>> 0 < r >>> 0) Wa();
                                                else {
                                                    c[p + 16 >> 2] = s;
                                                    c[s + 24 >> 2] = p;
                                                    break
                                                }
                                        } while (0);
                                        q = c[a + (q + 20) >> 2] | 0;
                                        if (q)
                                            if (q >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                            else {
                                                c[p + 20 >> 2] = q;
                                                c[q + 24 >> 2] = p;
                                                e = n;
                                                o = m;
                                                break
                                            }
                                        else {
                                            e = n;
                                            o = m
                                        }
                                    } else {
                                        e = n;
                                        o = m
                                    }
                                } else {
                                    e = q;
                                    o = j
                                }
                            } while (0);
                            if (e >>> 0 >= h >>> 0) Wa();
                            m = a + (j + -4) | 0;
                            n = c[m >> 2] | 0;
                            if (!(n & 1)) Wa();
                            if (!(n & 2)) {
                                if ((h | 0) == (c[1212] | 0)) {
                                    w = (c[1209] | 0) + o | 0;
                                    c[1209] = w;
                                    c[1212] = e;
                                    c[e + 4 >> 2] = w | 1;
                                    if ((e | 0) != (c[1211] | 0)) { i = b; return }
                                    c[1211] = 0;
                                    c[1208] = 0;
                                    i = b;
                                    return
                                }
                                if ((h | 0) == (c[1211] | 0)) {
                                    w = (c[1208] | 0) + o | 0;
                                    c[1208] = w;
                                    c[1211] = e;
                                    c[e + 4 >> 2] = w | 1;
                                    c[e + w >> 2] = w;
                                    i = b;
                                    return
                                }
                                o = (n & -8) + o | 0;
                                m = n >>> 3;
                                do {
                                    if (n >>> 0 >= 256) {
                                        l = c[a + (j + 16) >> 2] | 0;
                                        m = c[a + (j | 4) >> 2] | 0;
                                        do {
                                            if ((m | 0) == (h | 0)) {
                                                n = a + (j + 12) | 0;
                                                m = c[n >> 2] | 0;
                                                if (!m) {
                                                    n = a + (j + 8) | 0;
                                                    m = c[n >> 2] | 0;
                                                    if (!m) { k = 0; break }
                                                }
                                                while (1) {
                                                    q = m + 20 | 0;
                                                    p = c[q >> 2] | 0;
                                                    if (p) {
                                                        m = p;
                                                        n = q;
                                                        continue
                                                    }
                                                    p = m + 16 | 0;
                                                    q = c[p >> 2] | 0;
                                                    if (!q) break;
                                                    else {
                                                        m = q;
                                                        n = p
                                                    }
                                                }
                                                if (n >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                else {
                                                    c[n >> 2] = 0;
                                                    k = m;
                                                    break
                                                }
                                            } else {
                                                n = c[a + j >> 2] | 0;
                                                if (n >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                p = n + 12 | 0;
                                                if ((c[p >> 2] | 0) != (h | 0)) Wa();
                                                q = m + 8 | 0;
                                                if ((c[q >> 2] | 0) == (h | 0)) {
                                                    c[p >> 2] = m;
                                                    c[q >> 2] = n;
                                                    k = m;
                                                    break
                                                } else Wa()
                                            }
                                        } while (0);
                                        if (l) {
                                            m = c[a + (j + 20) >> 2] | 0;
                                            n = 5128 + (m << 2) | 0;
                                            if ((h | 0) == (c[n >> 2] | 0)) { c[n >> 2] = k; if (!k) { c[1207] = c[1207] & ~(1 << m); break } } else {
                                                if (l >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                m = l + 16 | 0;
                                                if ((c[m >> 2] | 0) == (h | 0)) c[m >> 2] = k;
                                                else c[l + 20 >> 2] = k;
                                                if (!k) break
                                            }
                                            h = c[1210] | 0;
                                            if (k >>> 0 < h >>> 0) Wa();
                                            c[k + 24 >> 2] = l;
                                            l = c[a + (j + 8) >> 2] | 0;
                                            do {
                                                if (l)
                                                    if (l >>> 0 < h >>> 0) Wa();
                                                    else {
                                                        c[k + 16 >> 2] = l;
                                                        c[l + 24 >> 2] = k;
                                                        break
                                                    }
                                            } while (0);
                                            h = c[a + (j + 12) >> 2] | 0;
                                            if (h)
                                                if (h >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                else {
                                                    c[k + 20 >> 2] = h;
                                                    c[h + 24 >> 2] = k;
                                                    break
                                                }
                                        }
                                    } else {
                                        k = c[a + j >> 2] | 0;
                                        j = c[a + (j | 4) >> 2] | 0;
                                        a = 4864 + (m << 1 << 2) | 0;
                                        if ((k | 0) != (a | 0)) { if (k >>> 0 < (c[1210] | 0) >>> 0) Wa(); if ((c[k + 12 >> 2] | 0) != (h | 0)) Wa() }
                                        if ((j | 0) == (k | 0)) { c[1206] = c[1206] & ~(1 << m); break }
                                        if ((j | 0) != (a | 0)) {
                                            if (j >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                            a = j + 8 | 0;
                                            if ((c[a >> 2] | 0) == (h | 0)) l = a;
                                            else Wa()
                                        } else l = j + 8 | 0;
                                        c[k + 12 >> 2] = j;
                                        c[l >> 2] = k
                                    }
                                } while (0);
                                c[e + 4 >> 2] = o | 1;
                                c[e + o >> 2] = o;
                                if ((e | 0) == (c[1211] | 0)) {
                                    c[1208] = o;
                                    i = b;
                                    return
                                }
                            } else {
                                c[m >> 2] = n & -2;
                                c[e + 4 >> 2] = o | 1;
                                c[e + o >> 2] = o
                            }
                            h = o >>> 3;
                            if (o >>> 0 < 256) {
                                j = h << 1;
                                d = 4864 + (j << 2) | 0;
                                k = c[1206] | 0;
                                h = 1 << h;
                                if (k & h) {
                                    j = 4864 + (j + 2 << 2) | 0;
                                    h = c[j >> 2] | 0;
                                    if (h >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                    else {
                                        f = j;
                                        g = h
                                    }
                                } else {
                                    c[1206] = k | h;
                                    f = 4864 + (j + 2 << 2) | 0;
                                    g = d
                                }
                                c[f >> 2] = e;
                                c[g + 12 >> 2] = e;
                                c[e + 8 >> 2] = g;
                                c[e + 12 >> 2] = d;
                                i = b;
                                return
                            }
                            f = o >>> 8;
                            if (f)
                                if (o >>> 0 > 16777215) f = 31;
                                else {
                                    v = (f + 1048320 | 0) >>> 16 & 8;
                                    w = f << v;
                                    u = (w + 520192 | 0) >>> 16 & 4;
                                    w = w << u;
                                    f = (w + 245760 | 0) >>> 16 & 2;
                                    f = 14 - (u | v | f) + (w << f >>> 15) | 0;
                                    f = o >>> (f + 7 | 0) & 1 | f << 1
                                }
                            else f = 0;
                            g = 5128 + (f << 2) | 0;
                            c[e + 28 >> 2] = f;
                            c[e + 20 >> 2] = 0;
                            c[e + 16 >> 2] = 0;
                            j = c[1207] | 0;
                            h = 1 << f;
                            a: do {
                                if (j & h) {
                                    g = c[g >> 2] | 0;
                                    if ((f | 0) == 31) f = 0;
                                    else f = 25 - (f >>> 1) | 0;
                                    b: do {
                                        if ((c[g + 4 >> 2] & -8 | 0) != (o | 0)) {
                                            f = o << f;
                                            while (1) {
                                                j = g + (f >>> 31 << 2) + 16 | 0;
                                                h = c[j >> 2] | 0;
                                                if (!h) break;
                                                if ((c[h + 4 >> 2] & -8 | 0) == (o | 0)) { d = h; break b } else {
                                                    f = f << 1;
                                                    g = h
                                                }
                                            }
                                            if (j >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                            else {
                                                c[j >> 2] = e;
                                                c[e + 24 >> 2] = g;
                                                c[e + 12 >> 2] = e;
                                                c[e + 8 >> 2] = e;
                                                break a
                                            }
                                        } else d = g
                                    } while (0);
                                    g = d + 8 | 0;
                                    f = c[g >> 2] | 0;
                                    w = c[1210] | 0;
                                    if (d >>> 0 >= w >>> 0 & f >>> 0 >= w >>> 0) {
                                        c[f + 12 >> 2] = e;
                                        c[g >> 2] = e;
                                        c[e + 8 >> 2] = f;
                                        c[e + 12 >> 2] = d;
                                        c[e + 24 >> 2] = 0;
                                        break
                                    } else Wa()
                                } else {
                                    c[1207] = j | h;
                                    c[g >> 2] = e;
                                    c[e + 24 >> 2] = g;
                                    c[e + 12 >> 2] = e;
                                    c[e + 8 >> 2] = e
                                }
                            } while (0);
                            w = (c[1214] | 0) + -1 | 0;
                            c[1214] = w;
                            if (!w) d = 5280 | 0;
                            else { i = b; return }
                            while (1) {
                                d = c[d >> 2] | 0;
                                if (!d) break;
                                else d = d + 8 | 0
                            }
                            c[1214] = -1;
                            i = b;
                            return
                        }

                        function Ud(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0;
                            d = i;
                            do {
                                if (a) {
                                    if (b >>> 0 > 4294967231) {
                                        c[(Oa() | 0) >> 2] = 12;
                                        e = 0;
                                        break
                                    }
                                    if (b >>> 0 < 11) e = 16;
                                    else e = b + 11 & -8;
                                    e = fe(a + -8 | 0, e) | 0;
                                    if (e) { e = e + 8 | 0; break }
                                    e = Sd(b) | 0;
                                    if (!e) e = 0;
                                    else {
                                        f = c[a + -4 >> 2] | 0;
                                        f = (f & -8) - ((f & 3 | 0) == 0 ? 8 : 4) | 0;
                                        pe(e | 0, a | 0, (f >>> 0 < b >>> 0 ? f : b) | 0) | 0;
                                        Td(a)
                                    }
                                } else e = Sd(b) | 0
                            } while (0);
                            i = d;
                            return e | 0
                        }

                        function Vd(a) {
                            a = a | 0;
                            if ((a | 0) == 32) a = 1;
                            else a = (a + -9 | 0) >>> 0 < 5;
                            return a & 1 | 0
                        }

                        function Wd(b, e, f, g, h) {
                            b = b | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            h = h | 0;
                            var j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0;
                            j = i;
                            if (e >>> 0 > 36) {
                                c[(Oa() | 0) >> 2] = 22;
                                s = 0;
                                t = 0;
                                F = s;
                                i = j;
                                return t | 0
                            }
                            k = b + 4 | 0;
                            l = b + 100 | 0;
                            do {
                                m = c[k >> 2] | 0;
                                if (m >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                    c[k >> 2] = m + 1;
                                    o = d[m >> 0] | 0
                                } else o = Zd(b) | 0
                            } while ((Vd(o) | 0) != 0);
                            do {
                                if ((o | 0) == 43 | (o | 0) == 45) {
                                    m = ((o | 0) == 45) << 31 >> 31;
                                    n = c[k >> 2] | 0;
                                    if (n >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                        c[k >> 2] = n + 1;
                                        o = d[n >> 0] | 0;
                                        break
                                    } else { o = Zd(b) | 0; break }
                                } else m = 0
                            } while (0);
                            n = (e | 0) == 0;
                            do {
                                if ((e & -17 | 0) == 0 & (o | 0) == 48) {
                                    o = c[k >> 2] | 0;
                                    if (o >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                        c[k >> 2] = o + 1;
                                        o = d[o >> 0] | 0
                                    } else o = Zd(b) | 0;
                                    if ((o | 32 | 0) != 120)
                                        if (n) {
                                            e = 8;
                                            f = 46;
                                            break
                                        } else { f = 32; break }
                                    e = c[k >> 2] | 0;
                                    if (e >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                        c[k >> 2] = e + 1;
                                        o = d[e >> 0] | 0
                                    } else o = Zd(b) | 0;
                                    if ((d[o + 5321 >> 0] | 0) > 15) {
                                        g = (c[l >> 2] | 0) == 0;
                                        if (!g) c[k >> 2] = (c[k >> 2] | 0) + -1;
                                        if (!f) {
                                            Yd(b, 0);
                                            s = 0;
                                            t = 0;
                                            F = s;
                                            i = j;
                                            return t | 0
                                        }
                                        if (g) {
                                            s = 0;
                                            t = 0;
                                            F = s;
                                            i = j;
                                            return t | 0
                                        }
                                        c[k >> 2] = (c[k >> 2] | 0) + -1;
                                        s = 0;
                                        t = 0;
                                        F = s;
                                        i = j;
                                        return t | 0
                                    } else {
                                        e = 16;
                                        f = 46
                                    }
                                } else {
                                    e = n ? 10 : e;
                                    if ((d[o + 5321 >> 0] | 0) >>> 0 < e >>> 0) f = 32;
                                    else {
                                        if (c[l >> 2] | 0) c[k >> 2] = (c[k >> 2] | 0) + -1;
                                        Yd(b, 0);
                                        c[(Oa() | 0) >> 2] = 22;
                                        s = 0;
                                        t = 0;
                                        F = s;
                                        i = j;
                                        return t | 0
                                    }
                                }
                            } while (0);
                            if ((f | 0) == 32)
                                if ((e | 0) == 10) {
                                    e = o + -48 | 0;
                                    if (e >>> 0 < 10) {
                                        n = 0;
                                        do {
                                            n = (n * 10 | 0) + e | 0;
                                            e = c[k >> 2] | 0;
                                            if (e >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                                c[k >> 2] = e + 1;
                                                o = d[e >> 0] | 0
                                            } else o = Zd(b) | 0;
                                            e = o + -48 | 0
                                        } while (e >>> 0 < 10 & n >>> 0 < 429496729);
                                        p = 0
                                    } else {
                                        n = 0;
                                        p = 0
                                    }
                                    e = o + -48 | 0;
                                    if (e >>> 0 < 10) {
                                        do {
                                            q = we(n | 0, p | 0, 10, 0) | 0;
                                            r = F;
                                            s = ((e | 0) < 0) << 31 >> 31;
                                            t = ~s;
                                            if (r >>> 0 > t >>> 0 | (r | 0) == (t | 0) & q >>> 0 > ~e >>> 0) break;
                                            n = ne(q | 0, r | 0, e | 0, s | 0) | 0;
                                            p = F;
                                            e = c[k >> 2] | 0;
                                            if (e >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                                c[k >> 2] = e + 1;
                                                o = d[e >> 0] | 0
                                            } else o = Zd(b) | 0;
                                            e = o + -48 | 0
                                        } while (e >>> 0 < 10 & (p >>> 0 < 429496729 | (p | 0) == 429496729 & n >>> 0 < 2576980378));
                                        if (e >>> 0 <= 9) {
                                            e = 10;
                                            f = 72
                                        }
                                    }
                                } else f = 46;
                            a: do {
                                if ((f | 0) == 46) {
                                    if (!(e + -1 & e)) {
                                        f = a[5584 + ((e * 23 | 0) >>> 5 & 7) >> 0] | 0;
                                        r = a[o + 5321 >> 0] | 0;
                                        n = r & 255;
                                        if (n >>> 0 < e >>> 0) {
                                            o = n;
                                            n = 0;
                                            do {
                                                n = o | n << f;
                                                o = c[k >> 2] | 0;
                                                if (o >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                                    c[k >> 2] = o + 1;
                                                    s = d[o >> 0] | 0
                                                } else s = Zd(b) | 0;
                                                r = a[s + 5321 >> 0] | 0;
                                                o = r & 255
                                            } while (o >>> 0 < e >>> 0 & n >>> 0 < 134217728);
                                            p = 0
                                        } else {
                                            p = 0;
                                            n = 0;
                                            s = o
                                        }
                                        o = oe(-1, -1, f | 0) | 0;
                                        q = F;
                                        if ((r & 255) >>> 0 >= e >>> 0 | (p >>> 0 > q >>> 0 | (p | 0) == (q | 0) & n >>> 0 > o >>> 0)) {
                                            o = s;
                                            f = 72;
                                            break
                                        }
                                        while (1) {
                                            n = le(n | 0, p | 0, f | 0) | 0;
                                            p = F;
                                            n = r & 255 | n;
                                            r = c[k >> 2] | 0;
                                            if (r >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                                c[k >> 2] = r + 1;
                                                s = d[r >> 0] | 0
                                            } else s = Zd(b) | 0;
                                            r = a[s + 5321 >> 0] | 0;
                                            if ((r & 255) >>> 0 >= e >>> 0 | (p >>> 0 > q >>> 0 | (p | 0) == (q | 0) & n >>> 0 > o >>> 0)) {
                                                o = s;
                                                f = 72;
                                                break a
                                            }
                                        }
                                    }
                                    r = a[o + 5321 >> 0] | 0;
                                    f = r & 255;
                                    if (f >>> 0 < e >>> 0) {
                                        n = 0;
                                        do {
                                            n = f + (ba(n, e) | 0) | 0;
                                            f = c[k >> 2] | 0;
                                            if (f >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                                c[k >> 2] = f + 1;
                                                q = d[f >> 0] | 0
                                            } else q = Zd(b) | 0;
                                            r = a[q + 5321 >> 0] | 0;
                                            f = r & 255
                                        } while (f >>> 0 < e >>> 0 & n >>> 0 < 119304647);
                                        p = 0
                                    } else {
                                        n = 0;
                                        p = 0;
                                        q = o
                                    }
                                    if ((r & 255) >>> 0 < e >>> 0) {
                                        f = xe(-1, -1, e | 0, 0) | 0;
                                        o = F;
                                        while (1) {
                                            if (p >>> 0 > o >>> 0 | (p | 0) == (o | 0) & n >>> 0 > f >>> 0) {
                                                o = q;
                                                f = 72;
                                                break a
                                            }
                                            s = we(n | 0, p | 0, e | 0, 0) | 0;
                                            t = F;
                                            r = r & 255;
                                            if (t >>> 0 > 4294967295 | (t | 0) == -1 & s >>> 0 > ~r >>> 0) {
                                                o = q;
                                                f = 72;
                                                break a
                                            }
                                            n = ne(r | 0, 0, s | 0, t | 0) | 0;
                                            p = F;
                                            q = c[k >> 2] | 0;
                                            if (q >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                                c[k >> 2] = q + 1;
                                                q = d[q >> 0] | 0
                                            } else q = Zd(b) | 0;
                                            r = a[q + 5321 >> 0] | 0;
                                            if ((r & 255) >>> 0 >= e >>> 0) {
                                                o = q;
                                                f = 72;
                                                break
                                            }
                                        }
                                    } else {
                                        o = q;
                                        f = 72
                                    }
                                }
                            } while (0);
                            if ((f | 0) == 72)
                                if ((d[o + 5321 >> 0] | 0) >>> 0 < e >>> 0) {
                                    do {
                                        f = c[k >> 2] | 0;
                                        if (f >>> 0 < (c[l >> 2] | 0) >>> 0) {
                                            c[k >> 2] = f + 1;
                                            f = d[f >> 0] | 0
                                        } else f = Zd(b) | 0
                                    } while ((d[f + 5321 >> 0] | 0) >>> 0 < e >>> 0);
                                    c[(Oa() | 0) >> 2] = 34;
                                    p = h;
                                    n = g
                                }
                            if (c[l >> 2] | 0) c[k >> 2] = (c[k >> 2] | 0) + -1;
                            if (!(p >>> 0 < h >>> 0 | (p | 0) == (h | 0) & n >>> 0 < g >>> 0)) {
                                if (!((g & 1 | 0) != 0 | 0 != 0 | (m | 0) != 0)) {
                                    c[(Oa() | 0) >> 2] = 34;
                                    t = ne(g | 0, h | 0, -1, -1) | 0;
                                    s = F;
                                    F = s;
                                    i = j;
                                    return t | 0
                                }
                                if (p >>> 0 > h >>> 0 | (p | 0) == (h | 0) & n >>> 0 > g >>> 0) {
                                    c[(Oa() | 0) >> 2] = 34;
                                    s = h;
                                    t = g;
                                    F = s;
                                    i = j;
                                    return t | 0
                                }
                            }
                            t = ((m | 0) < 0) << 31 >> 31;
                            t = je(n ^ m | 0, p ^ t | 0, m | 0, t | 0) | 0;
                            s = F;
                            F = s;
                            i = j;
                            return t | 0
                        }

                        function Xd(b, e, f) {
                            b = b | 0;
                            e = e | 0;
                            f = f | 0;
                            var g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0.0,
                                r = 0,
                                s = 0,
                                t = 0,
                                w = 0,
                                x = 0,
                                y = 0,
                                z = 0,
                                A = 0,
                                B = 0,
                                C = 0,
                                D = 0,
                                E = 0,
                                G = 0.0,
                                H = 0,
                                I = 0.0,
                                J = 0.0,
                                K = 0.0,
                                L = 0.0;
                            g = i;
                            i = i + 512 | 0;
                            k = g;
                            if (!e) {
                                e = 24;
                                j = -149
                            } else if ((e | 0) == 2) {
                                e = 53;
                                j = -1074
                            } else if ((e | 0) == 1) {
                                e = 53;
                                j = -1074
                            } else {
                                J = 0.0;
                                i = g;
                                return +J
                            }
                            n = b + 4 | 0;
                            o = b + 100 | 0;
                            do {
                                h = c[n >> 2] | 0;
                                if (h >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                    c[n >> 2] = h + 1;
                                    w = d[h >> 0] | 0
                                } else w = Zd(b) | 0
                            } while ((Vd(w) | 0) != 0);
                            do {
                                if ((w | 0) == 43 | (w | 0) == 45) {
                                    h = 1 - (((w | 0) == 45 & 1) << 1) | 0;
                                    m = c[n >> 2] | 0;
                                    if (m >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                        c[n >> 2] = m + 1;
                                        w = d[m >> 0] | 0;
                                        break
                                    } else { w = Zd(b) | 0; break }
                                } else h = 1
                            } while (0);
                            r = 0;
                            do {
                                if ((w | 32 | 0) != (a[5600 + r >> 0] | 0)) break;
                                do {
                                    if (r >>> 0 < 7) {
                                        m = c[n >> 2] | 0;
                                        if (m >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                            c[n >> 2] = m + 1;
                                            w = d[m >> 0] | 0;
                                            break
                                        } else { w = Zd(b) | 0; break }
                                    }
                                } while (0);
                                r = r + 1 | 0
                            } while (r >>> 0 < 8);
                            do {
                                if ((r | 0) == 3) p = 23;
                                else if ((r | 0) != 8) {
                                    m = (f | 0) != 0;
                                    if (r >>> 0 > 3 & m)
                                        if ((r | 0) == 8) break;
                                        else { p = 23; break }
                                    a: do {
                                        if (!r) {
                                            r = 0;
                                            do {
                                                if ((w | 32 | 0) != (a[5616 + r >> 0] | 0)) break a;
                                                do {
                                                    if (r >>> 0 < 2) {
                                                        s = c[n >> 2] | 0;
                                                        if (s >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                            c[n >> 2] = s + 1;
                                                            w = d[s >> 0] | 0;
                                                            break
                                                        } else { w = Zd(b) | 0; break }
                                                    }
                                                } while (0);
                                                r = r + 1 | 0
                                            } while (r >>> 0 < 3)
                                        }
                                    } while (0);
                                    if (!r) {
                                        do {
                                            if ((w | 0) == 48) {
                                                m = c[n >> 2] | 0;
                                                if (m >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                    c[n >> 2] = m + 1;
                                                    m = d[m >> 0] | 0
                                                } else m = Zd(b) | 0;
                                                if ((m | 32 | 0) != 120) {
                                                    if (!(c[o >> 2] | 0)) { w = 48; break }
                                                    c[n >> 2] = (c[n >> 2] | 0) + -1;
                                                    w = 48;
                                                    break
                                                }
                                                k = c[n >> 2] | 0;
                                                if (k >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                    c[n >> 2] = k + 1;
                                                    z = d[k >> 0] | 0;
                                                    x = 0
                                                } else {
                                                    z = Zd(b) | 0;
                                                    x = 0
                                                }
                                                while (1) {
                                                    if ((z | 0) == 46) { p = 70; break } else if ((z | 0) != 48) {
                                                        k = 0;
                                                        m = 0;
                                                        s = 0;
                                                        r = 0;
                                                        w = 0;
                                                        y = 0;
                                                        G = 1.0;
                                                        t = 0;
                                                        q = 0.0;
                                                        break
                                                    }
                                                    k = c[n >> 2] | 0;
                                                    if (k >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                        c[n >> 2] = k + 1;
                                                        z = d[k >> 0] | 0;
                                                        x = 1;
                                                        continue
                                                    } else {
                                                        z = Zd(b) | 0;
                                                        x = 1;
                                                        continue
                                                    }
                                                }
                                                if ((p | 0) == 70) {
                                                    k = c[n >> 2] | 0;
                                                    if (k >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                        c[n >> 2] = k + 1;
                                                        z = d[k >> 0] | 0
                                                    } else z = Zd(b) | 0;
                                                    if ((z | 0) == 48) {
                                                        s = 0;
                                                        r = 0;
                                                        do {
                                                            k = c[n >> 2] | 0;
                                                            if (k >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                                c[n >> 2] = k + 1;
                                                                z = d[k >> 0] | 0
                                                            } else z = Zd(b) | 0;
                                                            s = ne(s | 0, r | 0, -1, -1) | 0;
                                                            r = F
                                                        } while ((z | 0) == 48);
                                                        k = 0;
                                                        m = 0;
                                                        x = 1;
                                                        w = 1;
                                                        y = 0;
                                                        G = 1.0;
                                                        t = 0;
                                                        q = 0.0
                                                    } else {
                                                        k = 0;
                                                        m = 0;
                                                        s = 0;
                                                        r = 0;
                                                        w = 1;
                                                        y = 0;
                                                        G = 1.0;
                                                        t = 0;
                                                        q = 0.0
                                                    }
                                                }
                                                b: while (1) {
                                                    B = z + -48 | 0;
                                                    do {
                                                        if (B >>> 0 >= 10) {
                                                            A = z | 32;
                                                            C = (z | 0) == 46;
                                                            if (!((A + -97 | 0) >>> 0 < 6 | C)) break b;
                                                            if (C)
                                                                if (!w) {
                                                                    s = m;
                                                                    r = k;
                                                                    w = 1;
                                                                    break
                                                                } else { z = 46; break b }
                                                            else {
                                                                B = (z | 0) > 57 ? A + -87 | 0 : B;
                                                                p = 83;
                                                                break
                                                            }
                                                        } else p = 83
                                                    } while (0);
                                                    if ((p | 0) == 83) {
                                                        p = 0;
                                                        do {
                                                            if (!((k | 0) < 0 | (k | 0) == 0 & m >>> 0 < 8)) {
                                                                if ((k | 0) < 0 | (k | 0) == 0 & m >>> 0 < 14) {
                                                                    J = G * .0625;
                                                                    I = J;
                                                                    q = q + J * +(B | 0);
                                                                    break
                                                                }
                                                                if ((B | 0) == 0 | (y | 0) != 0) I = G;
                                                                else {
                                                                    y = 1;
                                                                    I = G;
                                                                    q = q + G * .5
                                                                }
                                                            } else {
                                                                I = G;
                                                                t = B + (t << 4) | 0
                                                            }
                                                        } while (0);
                                                        m = ne(m | 0, k | 0, 1, 0) | 0;
                                                        k = F;
                                                        x = 1;
                                                        G = I
                                                    }
                                                    z = c[n >> 2] | 0;
                                                    if (z >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                        c[n >> 2] = z + 1;
                                                        z = d[z >> 0] | 0;
                                                        continue
                                                    } else { z = Zd(b) | 0; continue }
                                                }
                                                if (!x) {
                                                    e = (c[o >> 2] | 0) == 0;
                                                    if (!e) c[n >> 2] = (c[n >> 2] | 0) + -1;
                                                    if (f) { if (!e ? (l = c[n >> 2] | 0, c[n >> 2] = l + -1, (w | 0) != 0) : 0) c[n >> 2] = l + -2 } else Yd(b, 0);
                                                    J = +(h | 0) * 0.0;
                                                    i = g;
                                                    return +J
                                                }
                                                p = (w | 0) == 0;
                                                l = p ? m : s;
                                                p = p ? k : r;
                                                if ((k | 0) < 0 | (k | 0) == 0 & m >>> 0 < 8)
                                                    do {
                                                        t = t << 4;
                                                        m = ne(m | 0, k | 0, 1, 0) | 0;
                                                        k = F
                                                    } while ((k | 0) < 0 | (k | 0) == 0 & m >>> 0 < 8);
                                                do {
                                                    if ((z | 32 | 0) == 112) {
                                                        m = he(b, f) | 0;
                                                        k = F;
                                                        if ((m | 0) == 0 & (k | 0) == -2147483648)
                                                            if (!f) {
                                                                Yd(b, 0);
                                                                J = 0.0;
                                                                i = g;
                                                                return +J
                                                            } else {
                                                                if (!(c[o >> 2] | 0)) {
                                                                    m = 0;
                                                                    k = 0;
                                                                    break
                                                                }
                                                                c[n >> 2] = (c[n >> 2] | 0) + -1;
                                                                m = 0;
                                                                k = 0;
                                                                break
                                                            }
                                                    } else if (!(c[o >> 2] | 0)) {
                                                        m = 0;
                                                        k = 0
                                                    } else {
                                                        c[n >> 2] = (c[n >> 2] | 0) + -1;
                                                        m = 0;
                                                        k = 0
                                                    }
                                                } while (0);
                                                l = le(l | 0, p | 0, 2) | 0;
                                                l = ne(l | 0, F | 0, -32, -1) | 0;
                                                k = ne(l | 0, F | 0, m | 0, k | 0) | 0;
                                                l = F;
                                                if (!t) {
                                                    J = +(h | 0) * 0.0;
                                                    i = g;
                                                    return +J
                                                }
                                                if ((l | 0) > 0 | (l | 0) == 0 & k >>> 0 > (0 - j | 0) >>> 0) {
                                                    c[(Oa() | 0) >> 2] = 34;
                                                    J = +(h | 0) * 1.7976931348623157e+308 * 1.7976931348623157e+308;
                                                    i = g;
                                                    return +J
                                                }
                                                H = j + -106 | 0;
                                                E = ((H | 0) < 0) << 31 >> 31;
                                                if ((l | 0) < (E | 0) | (l | 0) == (E | 0) & k >>> 0 < H >>> 0) {
                                                    c[(Oa() | 0) >> 2] = 34;
                                                    J = +(h | 0) * 2.2250738585072014e-308 * 2.2250738585072014e-308;
                                                    i = g;
                                                    return +J
                                                }
                                                if ((t | 0) > -1)
                                                    do {
                                                        t = t << 1;
                                                        if (!(q >= .5)) G = q;
                                                        else {
                                                            G = q + -1.0;
                                                            t = t | 1
                                                        }
                                                        q = q + G;
                                                        k = ne(k | 0, l | 0, -1, -1) | 0;
                                                        l = F
                                                    } while ((t | 0) > -1);
                                                j = je(32, 0, j | 0, ((j | 0) < 0) << 31 >> 31 | 0) | 0;
                                                j = ne(k | 0, l | 0, j | 0, F | 0) | 0;
                                                H = F;
                                                if (0 > (H | 0) | 0 == (H | 0) & e >>> 0 > j >>> 0)
                                                    if ((j | 0) < 0) {
                                                        e = 0;
                                                        p = 126
                                                    } else {
                                                        e = j;
                                                        p = 124
                                                    }
                                                else p = 124;
                                                if ((p | 0) == 124)
                                                    if ((e | 0) < 53) p = 126;
                                                    else {
                                                        j = e;
                                                        G = +(h | 0);
                                                        I = 0.0
                                                    }
                                                if ((p | 0) == 126) {
                                                    I = +(h | 0);
                                                    j = e;
                                                    G = I;
                                                    I = +Va(+ +_d(1.0, 84 - e | 0), +I)
                                                }
                                                H = (j | 0) < 32 & q != 0.0 & (t & 1 | 0) == 0;
                                                q = G * (H ? 0.0 : q) + (I + G * +(((H & 1) + t | 0) >>> 0)) - I;
                                                if (!(q != 0.0)) c[(Oa() | 0) >> 2] = 34;
                                                J = +$d(q, k);
                                                i = g;
                                                return +J
                                            }
                                        } while (0);
                                        m = j + e | 0;
                                        l = 0 - m | 0;
                                        B = 0;
                                        while (1) {
                                            if ((w | 0) == 46) { p = 137; break } else if ((w | 0) != 48) {
                                                D = 0;
                                                C = 0;
                                                A = 0;
                                                break
                                            }
                                            r = c[n >> 2] | 0;
                                            if (r >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                c[n >> 2] = r + 1;
                                                w = d[r >> 0] | 0;
                                                B = 1;
                                                continue
                                            } else {
                                                w = Zd(b) | 0;
                                                B = 1;
                                                continue
                                            }
                                        }
                                        if ((p | 0) == 137) {
                                            p = c[n >> 2] | 0;
                                            if (p >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                c[n >> 2] = p + 1;
                                                w = d[p >> 0] | 0
                                            } else w = Zd(b) | 0;
                                            if ((w | 0) == 48) {
                                                D = 0;
                                                C = 0;
                                                do {
                                                    D = ne(D | 0, C | 0, -1, -1) | 0;
                                                    C = F;
                                                    p = c[n >> 2] | 0;
                                                    if (p >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                        c[n >> 2] = p + 1;
                                                        w = d[p >> 0] | 0
                                                    } else w = Zd(b) | 0
                                                } while ((w | 0) == 48);
                                                B = 1;
                                                A = 1
                                            } else {
                                                D = 0;
                                                C = 0;
                                                A = 1
                                            }
                                        }
                                        c[k >> 2] = 0;
                                        z = w + -48 | 0;
                                        E = (w | 0) == 46;
                                        c: do {
                                            if (z >>> 0 < 10 | E) {
                                                p = k + 496 | 0;
                                                y = 0;
                                                x = 0;
                                                t = 0;
                                                s = 0;
                                                r = 0;
                                                d: while (1) {
                                                    do {
                                                        if (E)
                                                            if (!A) {
                                                                D = y;
                                                                C = x;
                                                                A = 1
                                                            } else break d;
                                                        else {
                                                            E = ne(y | 0, x | 0, 1, 0) | 0;
                                                            x = F;
                                                            H = (w | 0) != 48;
                                                            if ((s | 0) >= 125) {
                                                                if (!H) { y = E; break }
                                                                c[p >> 2] = c[p >> 2] | 1;
                                                                y = E;
                                                                break
                                                            }
                                                            y = k + (s << 2) | 0;
                                                            if (t) z = w + -48 + ((c[y >> 2] | 0) * 10 | 0) | 0;
                                                            c[y >> 2] = z;
                                                            t = t + 1 | 0;
                                                            z = (t | 0) == 9;
                                                            y = E;
                                                            B = 1;
                                                            t = z ? 0 : t;
                                                            s = (z & 1) + s | 0;
                                                            r = H ? E : r
                                                        }
                                                    } while (0);
                                                    w = c[n >> 2] | 0;
                                                    if (w >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                        c[n >> 2] = w + 1;
                                                        w = d[w >> 0] | 0
                                                    } else w = Zd(b) | 0;
                                                    z = w + -48 | 0;
                                                    E = (w | 0) == 46;
                                                    if (!(z >>> 0 < 10 | E)) { p = 160; break c }
                                                }
                                                z = (B | 0) != 0;
                                                p = 168
                                            } else {
                                                y = 0;
                                                x = 0;
                                                t = 0;
                                                s = 0;
                                                r = 0;
                                                p = 160
                                            }
                                        } while (0);
                                        do {
                                            if ((p | 0) == 160) {
                                                z = (A | 0) == 0;
                                                D = z ? y : D;
                                                C = z ? x : C;
                                                z = (B | 0) != 0;
                                                if (!(z & (w | 32 | 0) == 101))
                                                    if ((w | 0) > -1) { p = 168; break } else { p = 170; break }
                                                z = he(b, f) | 0;
                                                w = F;
                                                do {
                                                    if ((z | 0) == 0 & (w | 0) == -2147483648)
                                                        if (!f) {
                                                            Yd(b, 0);
                                                            J = 0.0;
                                                            i = g;
                                                            return +J
                                                        } else {
                                                            if (!(c[o >> 2] | 0)) {
                                                                z = 0;
                                                                w = 0;
                                                                break
                                                            }
                                                            c[n >> 2] = (c[n >> 2] | 0) + -1;
                                                            z = 0;
                                                            w = 0;
                                                            break
                                                        }
                                                } while (0);
                                                b = ne(z | 0, w | 0, D | 0, C | 0) | 0;
                                                C = F
                                            }
                                        } while (0);
                                        if ((p | 0) == 168)
                                            if (c[o >> 2] | 0) {
                                                c[n >> 2] = (c[n >> 2] | 0) + -1;
                                                if (z) b = D;
                                                else p = 171
                                            } else p = 170;
                                        if ((p | 0) == 170)
                                            if (z) b = D;
                                            else p = 171;
                                        if ((p | 0) == 171) {
                                            c[(Oa() | 0) >> 2] = 22;
                                            Yd(b, 0);
                                            J = 0.0;
                                            i = g;
                                            return +J
                                        }
                                        n = c[k >> 2] | 0;
                                        if (!n) {
                                            J = +(h | 0) * 0.0;
                                            i = g;
                                            return +J
                                        }
                                        if ((b | 0) == (y | 0) & (C | 0) == (x | 0) & ((x | 0) < 0 | (x | 0) == 0 & y >>> 0 < 10) ? e >>> 0 > 30 | (n >>> e | 0) == 0 : 0) {
                                            J = +(h | 0) * +(n >>> 0);
                                            i = g;
                                            return +J
                                        }
                                        H = (j | 0) / -2 | 0;
                                        E = ((H | 0) < 0) << 31 >> 31;
                                        if ((C | 0) > (E | 0) | (C | 0) == (E | 0) & b >>> 0 > H >>> 0) {
                                            c[(Oa() | 0) >> 2] = 34;
                                            J = +(h | 0) * 1.7976931348623157e+308 * 1.7976931348623157e+308;
                                            i = g;
                                            return +J
                                        }
                                        H = j + -106 | 0;
                                        E = ((H | 0) < 0) << 31 >> 31;
                                        if ((C | 0) < (E | 0) | (C | 0) == (E | 0) & b >>> 0 < H >>> 0) {
                                            c[(Oa() | 0) >> 2] = 34;
                                            J = +(h | 0) * 2.2250738585072014e-308 * 2.2250738585072014e-308;
                                            i = g;
                                            return +J
                                        }
                                        if (t) {
                                            if ((t | 0) < 9) {
                                                n = k + (s << 2) | 0;
                                                o = c[n >> 2] | 0;
                                                do {
                                                    o = o * 10 | 0;
                                                    t = t + 1 | 0
                                                } while ((t | 0) != 9);
                                                c[n >> 2] = o
                                            }
                                            s = s + 1 | 0
                                        }
                                        if ((r | 0) < 9 ? (r | 0) <= (b | 0) & (b | 0) < 18 : 0) {
                                            if ((b | 0) == 9) {
                                                J = +(h | 0) * +((c[k >> 2] | 0) >>> 0);
                                                i = g;
                                                return +J
                                            }
                                            if ((b | 0) < 9) {
                                                J = +(h | 0) * +((c[k >> 2] | 0) >>> 0) / +(c[5632 + (8 - b << 2) >> 2] | 0);
                                                i = g;
                                                return +J
                                            }
                                            H = e + 27 + (ba(b, -3) | 0) | 0;
                                            n = c[k >> 2] | 0;
                                            if ((H | 0) > 30 | (n >>> H | 0) == 0) {
                                                J = +(h | 0) * +(n >>> 0) * +(c[5632 + (b + -10 << 2) >> 2] | 0);
                                                i = g;
                                                return +J
                                            }
                                        }
                                        n = (b | 0) % 9 | 0;
                                        if (!n) {
                                            n = 0;
                                            o = 0
                                        } else {
                                            f = (b | 0) > -1 ? n : n + 9 | 0;
                                            p = c[5632 + (8 - f << 2) >> 2] | 0;
                                            if (s) {
                                                r = 1e9 / (p | 0) | 0;
                                                n = 0;
                                                o = 0;
                                                t = 0;
                                                do {
                                                    D = k + (t << 2) | 0;
                                                    E = c[D >> 2] | 0;
                                                    H = ((E >>> 0) / (p >>> 0) | 0) + o | 0;
                                                    c[D >> 2] = H;
                                                    o = ba((E >>> 0) % (p >>> 0) | 0, r) | 0;
                                                    E = t;
                                                    t = t + 1 | 0;
                                                    if ((E | 0) == (n | 0) & (H | 0) == 0) {
                                                        n = t & 127;
                                                        b = b + -9 | 0
                                                    }
                                                } while ((t | 0) != (s | 0));
                                                if (o) {
                                                    c[k + (s << 2) >> 2] = o;
                                                    s = s + 1 | 0
                                                }
                                            } else {
                                                n = 0;
                                                s = 0
                                            }
                                            o = 0;
                                            b = 9 - f + b | 0
                                        }
                                        e: while (1) {
                                            f = k + (n << 2) | 0;
                                            if ((b | 0) < 18) {
                                                do {
                                                    r = 0;
                                                    f = s + 127 | 0;
                                                    while (1) {
                                                        f = f & 127;
                                                        p = k + (f << 2) | 0;
                                                        t = le(c[p >> 2] | 0, 0, 29) | 0;
                                                        t = ne(t | 0, F | 0, r | 0, 0) | 0;
                                                        r = F;
                                                        if (r >>> 0 > 0 | (r | 0) == 0 & t >>> 0 > 1e9) {
                                                            H = xe(t | 0, r | 0, 1e9, 0) | 0;
                                                            t = ye(t | 0, r | 0, 1e9, 0) | 0;
                                                            r = H
                                                        } else r = 0;
                                                        c[p >> 2] = t;
                                                        p = (f | 0) == (n | 0);
                                                        if (!((f | 0) != (s + 127 & 127 | 0) | p)) s = (t | 0) == 0 ? f : s;
                                                        if (p) break;
                                                        else f = f + -1 | 0
                                                    }
                                                    o = o + -29 | 0
                                                } while ((r | 0) == 0)
                                            } else {
                                                if ((b | 0) != 18) break;
                                                do {
                                                    if ((c[f >> 2] | 0) >>> 0 >= 9007199) { b = 18; break e }
                                                    r = 0;
                                                    p = s + 127 | 0;
                                                    while (1) {
                                                        p = p & 127;
                                                        t = k + (p << 2) | 0;
                                                        w = le(c[t >> 2] | 0, 0, 29) | 0;
                                                        w = ne(w | 0, F | 0, r | 0, 0) | 0;
                                                        r = F;
                                                        if (r >>> 0 > 0 | (r | 0) == 0 & w >>> 0 > 1e9) {
                                                            H = xe(w | 0, r | 0, 1e9, 0) | 0;
                                                            w = ye(w | 0, r | 0, 1e9, 0) | 0;
                                                            r = H
                                                        } else r = 0;
                                                        c[t >> 2] = w;
                                                        t = (p | 0) == (n | 0);
                                                        if (!((p | 0) != (s + 127 & 127 | 0) | t)) s = (w | 0) == 0 ? p : s;
                                                        if (t) break;
                                                        else p = p + -1 | 0
                                                    }
                                                    o = o + -29 | 0
                                                } while ((r | 0) == 0)
                                            }
                                            n = n + 127 & 127;
                                            if ((n | 0) == (s | 0)) {
                                                H = s + 127 & 127;
                                                s = k + ((s + 126 & 127) << 2) | 0;
                                                c[s >> 2] = c[s >> 2] | c[k + (H << 2) >> 2];
                                                s = H
                                            }
                                            c[k + (n << 2) >> 2] = r;
                                            b = b + 9 | 0
                                        }
                                        f: while (1) {
                                            f = s + 1 & 127;
                                            p = k + ((s + 127 & 127) << 2) | 0;
                                            while (1) {
                                                t = (b | 0) == 18;
                                                r = (b | 0) > 27 ? 9 : 1;
                                                while (1) {
                                                    w = 0;
                                                    while (1) {
                                                        x = w + n & 127;
                                                        if ((x | 0) == (s | 0)) { w = 2; break }
                                                        y = c[k + (x << 2) >> 2] | 0;
                                                        z = c[5624 + (w << 2) >> 2] | 0;
                                                        if (y >>> 0 < z >>> 0) { w = 2; break }
                                                        x = w + 1 | 0;
                                                        if (y >>> 0 > z >>> 0) break;
                                                        if ((x | 0) < 2) w = x;
                                                        else { w = x; break }
                                                    }
                                                    if ((w | 0) == 2 & t) break f;
                                                    o = r + o | 0;
                                                    if ((n | 0) == (s | 0)) n = s;
                                                    else break
                                                }
                                                t = (1 << r) + -1 | 0;
                                                w = 1e9 >>> r;
                                                x = n;
                                                y = 0;
                                                do {
                                                    D = k + (n << 2) | 0;
                                                    E = c[D >> 2] | 0;
                                                    H = (E >>> r) + y | 0;
                                                    c[D >> 2] = H;
                                                    y = ba(E & t, w) | 0;
                                                    H = (n | 0) == (x | 0) & (H | 0) == 0;
                                                    n = n + 1 & 127;
                                                    b = H ? b + -9 | 0 : b;
                                                    x = H ? n : x
                                                } while ((n | 0) != (s | 0));
                                                if (!y) { n = x; continue }
                                                if ((f | 0) != (x | 0)) break;
                                                c[p >> 2] = c[p >> 2] | 1;
                                                n = x
                                            }
                                            c[k + (s << 2) >> 2] = y;
                                            n = x;
                                            s = f
                                        }
                                        b = n & 127;
                                        if ((b | 0) == (s | 0)) {
                                            c[k + (f + -1 << 2) >> 2] = 0;
                                            s = f
                                        }
                                        G = +((c[k + (b << 2) >> 2] | 0) >>> 0);
                                        b = n + 1 & 127;
                                        if ((b | 0) == (s | 0)) {
                                            s = s + 1 & 127;
                                            c[k + (s + -1 << 2) >> 2] = 0
                                        }
                                        q = +(h | 0);
                                        I = q * (G * 1.0e9 + +((c[k + (b << 2) >> 2] | 0) >>> 0));
                                        h = o + 53 | 0;
                                        j = h - j | 0;
                                        if ((j | 0) < (e | 0))
                                            if ((j | 0) < 0) {
                                                e = 0;
                                                b = 1;
                                                p = 244
                                            } else {
                                                e = j;
                                                b = 1;
                                                p = 243
                                            }
                                        else {
                                            b = 0;
                                            p = 243
                                        }
                                        if ((p | 0) == 243)
                                            if ((e | 0) < 53) p = 244;
                                            else {
                                                G = 0.0;
                                                J = 0.0
                                            }
                                        if ((p | 0) == 244) {
                                            L = +Va(+ +_d(1.0, 105 - e | 0), +I);
                                            K = +cb(+I, + +_d(1.0, 53 - e | 0));
                                            G = L;
                                            J = K;
                                            I = L + (I - K)
                                        }
                                        f = n + 2 & 127;
                                        do {
                                            if ((f | 0) != (s | 0)) {
                                                k = c[k + (f << 2) >> 2] | 0;
                                                do {
                                                    if (k >>> 0 >= 5e8) { if (k >>> 0 > 5e8) { J = q * .75 + J; break } if ((n + 3 & 127 | 0) == (s | 0)) { J = q * .5 + J; break } else { J = q * .75 + J; break } } else {
                                                        if ((k | 0) == 0 ? (n + 3 & 127 | 0) == (s | 0) : 0) break;
                                                        J = q * .25 + J
                                                    }
                                                } while (0);
                                                if ((53 - e | 0) <= 1) break;
                                                if (+cb(+J, 1.0) != 0.0) break;
                                                J = J + 1.0
                                            }
                                        } while (0);
                                        q = I + J - G;
                                        do {
                                            if ((h & 2147483647 | 0) > (-2 - m | 0)) {
                                                if (+Q(+q) >= 9007199254740992.0) {
                                                    b = (b | 0) != 0 & (e | 0) == (j | 0) ? 0 : b;
                                                    o = o + 1 | 0;
                                                    q = q * .5
                                                }
                                                if ((o + 50 | 0) <= (l | 0) ? !((b | 0) != 0 & J != 0.0) : 0) break;
                                                c[(Oa() | 0) >> 2] = 34
                                            }
                                        } while (0);
                                        L = +$d(q, o);
                                        i = g;
                                        return +L
                                    } else if ((r | 0) == 3) {
                                        e = c[n >> 2] | 0;
                                        if (e >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                            c[n >> 2] = e + 1;
                                            e = d[e >> 0] | 0
                                        } else e = Zd(b) | 0;
                                        if ((e | 0) == 40) e = 1;
                                        else {
                                            if (!(c[o >> 2] | 0)) {
                                                L = u;
                                                i = g;
                                                return +L
                                            }
                                            c[n >> 2] = (c[n >> 2] | 0) + -1;
                                            L = u;
                                            i = g;
                                            return +L
                                        }
                                        while (1) {
                                            h = c[n >> 2] | 0;
                                            if (h >>> 0 < (c[o >> 2] | 0) >>> 0) {
                                                c[n >> 2] = h + 1;
                                                h = d[h >> 0] | 0
                                            } else h = Zd(b) | 0;
                                            if (!((h + -48 | 0) >>> 0 < 10 | (h + -65 | 0) >>> 0 < 26) ? !((h + -97 | 0) >>> 0 < 26 | (h | 0) == 95) : 0) break;
                                            e = e + 1 | 0
                                        }
                                        if ((h | 0) == 41) {
                                            L = u;
                                            i = g;
                                            return +L
                                        }
                                        h = (c[o >> 2] | 0) == 0;
                                        if (!h) c[n >> 2] = (c[n >> 2] | 0) + -1;
                                        if (!m) {
                                            c[(Oa() | 0) >> 2] = 22;
                                            Yd(b, 0);
                                            L = 0.0;
                                            i = g;
                                            return +L
                                        }
                                        if ((e | 0) == 0 | h) {
                                            L = u;
                                            i = g;
                                            return +L
                                        }
                                        do {
                                            e = e + -1 | 0;
                                            c[n >> 2] = (c[n >> 2] | 0) + -1
                                        } while ((e | 0) != 0);
                                        q = u;
                                        i = g;
                                        return +q
                                    } else {
                                        if (c[o >> 2] | 0) c[n >> 2] = (c[n >> 2] | 0) + -1;
                                        c[(Oa() | 0) >> 2] = 22;
                                        Yd(b, 0);
                                        L = 0.0;
                                        i = g;
                                        return +L
                                    }
                                }
                            } while (0);
                            if ((p | 0) == 23) {
                                e = (c[o >> 2] | 0) == 0;
                                if (!e) c[n >> 2] = (c[n >> 2] | 0) + -1;
                                if (!(r >>> 0 < 4 | (f | 0) == 0 | e))
                                    do {
                                        c[n >> 2] = (c[n >> 2] | 0) + -1;
                                        r = r + -1 | 0
                                    } while (r >>> 0 > 3)
                            }
                            L = +(h | 0) * v;
                            i = g;
                            return +L
                        }

                        function Yd(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0;
                            d = i;
                            c[a + 104 >> 2] = b;
                            f = c[a + 8 >> 2] | 0;
                            e = c[a + 4 >> 2] | 0;
                            g = f - e | 0;
                            c[a + 108 >> 2] = g;
                            if ((b | 0) != 0 & (g | 0) > (b | 0)) {
                                c[a + 100 >> 2] = e + b;
                                i = d;
                                return
                            } else {
                                c[a + 100 >> 2] = f;
                                i = d;
                                return
                            }
                        }

                        function Zd(b) {
                            b = b | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0;
                            f = i;
                            j = b + 104 | 0;
                            l = c[j >> 2] | 0;
                            if (!((l | 0) != 0 ? (c[b + 108 >> 2] | 0) >= (l | 0) : 0)) k = 3;
                            if ((k | 0) == 3 ? (e = be(b) | 0, (e | 0) >= 0) : 0) {
                                k = c[j >> 2] | 0;
                                j = c[b + 8 >> 2] | 0;
                                if ((k | 0) != 0 ? (g = c[b + 4 >> 2] | 0, h = k - (c[b + 108 >> 2] | 0) + -1 | 0, (j - g | 0) > (h | 0)) : 0) c[b + 100 >> 2] = g + h;
                                else c[b + 100 >> 2] = j;
                                g = c[b + 4 >> 2] | 0;
                                if (j) {
                                    l = b + 108 | 0;
                                    c[l >> 2] = j + 1 - g + (c[l >> 2] | 0)
                                }
                                b = g + -1 | 0;
                                if ((d[b >> 0] | 0 | 0) == (e | 0)) {
                                    l = e;
                                    i = f;
                                    return l | 0
                                }
                                a[b >> 0] = e;
                                l = e;
                                i = f;
                                return l | 0
                            }
                            c[b + 100 >> 2] = 0;
                            l = -1;
                            i = f;
                            return l | 0
                        }

                        function _d(a, b) {
                            a = +a;
                            b = b | 0;
                            var d = 0,
                                e = 0;
                            d = i;
                            if ((b | 0) > 1023) {
                                a = a * 8.98846567431158e+307;
                                e = b + -1023 | 0;
                                if ((e | 0) > 1023) {
                                    b = b + -2046 | 0;
                                    b = (b | 0) > 1023 ? 1023 : b;
                                    a = a * 8.98846567431158e+307
                                } else b = e
                            } else if ((b | 0) < -1022) {
                                a = a * 2.2250738585072014e-308;
                                e = b + 1022 | 0;
                                if ((e | 0) < -1022) {
                                    b = b + 2044 | 0;
                                    b = (b | 0) < -1022 ? -1022 : b;
                                    a = a * 2.2250738585072014e-308
                                } else b = e
                            }
                            b = le(b + 1023 | 0, 0, 52) | 0;
                            e = F;
                            c[k >> 2] = b;
                            c[k + 4 >> 2] = e;
                            a = a * +h[k >> 3];
                            i = d;
                            return +a
                        }

                        function $d(a, b) {
                            a = +a;
                            b = b | 0;
                            var c = 0;
                            c = i;
                            a = +_d(a, b);
                            i = c;
                            return +a
                        }

                        function ae(b) {
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0;
                            e = i;
                            f = b + 74 | 0;
                            d = a[f >> 0] | 0;
                            a[f >> 0] = d + 255 | d;
                            f = b + 20 | 0;
                            d = b + 44 | 0;
                            if ((c[f >> 2] | 0) >>> 0 > (c[d >> 2] | 0) >>> 0) eb[c[b + 36 >> 2] & 1](b, 0, 0) | 0;
                            c[b + 16 >> 2] = 0;
                            c[b + 28 >> 2] = 0;
                            c[f >> 2] = 0;
                            f = c[b >> 2] | 0;
                            if (!(f & 20)) {
                                f = c[d >> 2] | 0;
                                c[b + 8 >> 2] = f;
                                c[b + 4 >> 2] = f;
                                f = 0;
                                i = e;
                                return f | 0
                            }
                            if (!(f & 4)) {
                                f = -1;
                                i = e;
                                return f | 0
                            }
                            c[b >> 2] = f | 32;
                            f = -1;
                            i = e;
                            return f | 0
                        }

                        function be(a) {
                            a = a | 0;
                            var b = 0,
                                e = 0;
                            b = i;
                            i = i + 16 | 0;
                            e = b;
                            if ((c[a + 8 >> 2] | 0) == 0 ? (ae(a) | 0) != 0 : 0) a = -1;
                            else if ((eb[c[a + 32 >> 2] & 1](a, e, 1) | 0) == 1) a = d[e >> 0] | 0;
                            else a = -1;
                            i = b;
                            return a | 0
                        }

                        function ce(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0.0,
                                g = 0,
                                h = 0;
                            d = i;
                            i = i + 112 | 0;
                            e = d;
                            h = e + 0 | 0;
                            g = h + 112 | 0;
                            do {
                                c[h >> 2] = 0;
                                h = h + 4 | 0
                            } while ((h | 0) < (g | 0));
                            g = e + 4 | 0;
                            c[g >> 2] = a;
                            h = e + 8 | 0;
                            c[h >> 2] = -1;
                            c[e + 44 >> 2] = a;
                            c[e + 76 >> 2] = -1;
                            Yd(e, 0);
                            f = +Xd(e, 1, 1);
                            e = (c[g >> 2] | 0) - (c[h >> 2] | 0) + (c[e + 108 >> 2] | 0) | 0;
                            if (!b) { i = d; return +f }
                            if (e) a = a + e | 0;
                            c[b >> 2] = a;
                            i = d;
                            return +f
                        }

                        function de(a, b, d) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0;
                            e = i;
                            i = i + 112 | 0;
                            g = e;
                            c[g >> 2] = 0;
                            f = g + 4 | 0;
                            c[f >> 2] = a;
                            c[g + 44 >> 2] = a;
                            if ((a | 0) < 0) c[g + 8 >> 2] = -1;
                            else c[g + 8 >> 2] = a + 2147483647;
                            c[g + 76 >> 2] = -1;
                            Yd(g, 0);
                            d = Wd(g, d, 1, -2147483648, 0) | 0;
                            if (!b) { i = e; return d | 0 }
                            c[b >> 2] = a + ((c[f >> 2] | 0) + (c[g + 108 >> 2] | 0) - (c[g + 8 >> 2] | 0));
                            i = e;
                            return d | 0
                        }

                        function ee(b, c) {
                            b = b | 0;
                            c = c | 0;
                            var d = 0,
                                e = 0,
                                f = 0;
                            d = i;
                            f = a[b >> 0] | 0;
                            e = a[c >> 0] | 0;
                            if (f << 24 >> 24 == 0 ? 1 : f << 24 >> 24 != e << 24 >> 24) c = f;
                            else {
                                do {
                                    b = b + 1 | 0;
                                    c = c + 1 | 0;
                                    f = a[b >> 0] | 0;
                                    e = a[c >> 0] | 0
                                } while (!(f << 24 >> 24 == 0 ? 1 : f << 24 >> 24 != e << 24 >> 24));
                                c = f
                            }
                            i = d;
                            return (c & 255) - (e & 255) | 0
                        }

                        function fe(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0;
                            d = i;
                            f = a + 4 | 0;
                            e = c[f >> 2] | 0;
                            l = e & -8;
                            j = a + l | 0;
                            m = c[1210] | 0;
                            h = e & 3;
                            if (!((h | 0) != 1 & a >>> 0 >= m >>> 0 & a >>> 0 < j >>> 0)) Wa();
                            g = a + (l | 4) | 0;
                            p = c[g >> 2] | 0;
                            if (!(p & 1)) Wa();
                            if (!h) {
                                if (b >>> 0 < 256) {
                                    r = 0;
                                    i = d;
                                    return r | 0
                                }
                                if (l >>> 0 >= (b + 4 | 0) >>> 0 ? (l - b | 0) >>> 0 <= c[1326] << 1 >>> 0 : 0) {
                                    r = a;
                                    i = d;
                                    return r | 0
                                }
                                r = 0;
                                i = d;
                                return r | 0
                            }
                            if (l >>> 0 >= b >>> 0) {
                                h = l - b | 0;
                                if (h >>> 0 <= 15) {
                                    r = a;
                                    i = d;
                                    return r | 0
                                }
                                c[f >> 2] = e & 1 | b | 2;
                                c[a + (b + 4) >> 2] = h | 3;
                                c[g >> 2] = c[g >> 2] | 1;
                                ge(a + b | 0, h);
                                r = a;
                                i = d;
                                return r | 0
                            }
                            if ((j | 0) == (c[1212] | 0)) {
                                g = (c[1209] | 0) + l | 0;
                                if (g >>> 0 <= b >>> 0) {
                                    r = 0;
                                    i = d;
                                    return r | 0
                                }
                                r = g - b | 0;
                                c[f >> 2] = e & 1 | b | 2;
                                c[a + (b + 4) >> 2] = r | 1;
                                c[1212] = a + b;
                                c[1209] = r;
                                r = a;
                                i = d;
                                return r | 0
                            }
                            if ((j | 0) == (c[1211] | 0)) {
                                h = (c[1208] | 0) + l | 0;
                                if (h >>> 0 < b >>> 0) {
                                    r = 0;
                                    i = d;
                                    return r | 0
                                }
                                g = h - b | 0;
                                if (g >>> 0 > 15) {
                                    c[f >> 2] = e & 1 | b | 2;
                                    c[a + (b + 4) >> 2] = g | 1;
                                    c[a + h >> 2] = g;
                                    e = a + (h + 4) | 0;
                                    c[e >> 2] = c[e >> 2] & -2;
                                    e = a + b | 0
                                } else {
                                    c[f >> 2] = e & 1 | h | 2;
                                    e = a + (h + 4) | 0;
                                    c[e >> 2] = c[e >> 2] | 1;
                                    e = 0;
                                    g = 0
                                }
                                c[1208] = g;
                                c[1211] = e;
                                r = a;
                                i = d;
                                return r | 0
                            }
                            if (p & 2) {
                                r = 0;
                                i = d;
                                return r | 0
                            }
                            g = (p & -8) + l | 0;
                            if (g >>> 0 < b >>> 0) {
                                r = 0;
                                i = d;
                                return r | 0
                            }
                            h = g - b | 0;
                            o = p >>> 3;
                            do {
                                if (p >>> 0 >= 256) {
                                    n = c[a + (l + 24) >> 2] | 0;
                                    o = c[a + (l + 12) >> 2] | 0;
                                    do {
                                        if ((o | 0) == (j | 0)) {
                                            p = a + (l + 20) | 0;
                                            o = c[p >> 2] | 0;
                                            if (!o) {
                                                p = a + (l + 16) | 0;
                                                o = c[p >> 2] | 0;
                                                if (!o) { k = 0; break }
                                            }
                                            while (1) {
                                                r = o + 20 | 0;
                                                q = c[r >> 2] | 0;
                                                if (q) {
                                                    o = q;
                                                    p = r;
                                                    continue
                                                }
                                                q = o + 16 | 0;
                                                r = c[q >> 2] | 0;
                                                if (!r) break;
                                                else {
                                                    o = r;
                                                    p = q
                                                }
                                            }
                                            if (p >>> 0 < m >>> 0) Wa();
                                            else {
                                                c[p >> 2] = 0;
                                                k = o;
                                                break
                                            }
                                        } else {
                                            p = c[a + (l + 8) >> 2] | 0;
                                            if (p >>> 0 < m >>> 0) Wa();
                                            m = p + 12 | 0;
                                            if ((c[m >> 2] | 0) != (j | 0)) Wa();
                                            q = o + 8 | 0;
                                            if ((c[q >> 2] | 0) == (j | 0)) {
                                                c[m >> 2] = o;
                                                c[q >> 2] = p;
                                                k = o;
                                                break
                                            } else Wa()
                                        }
                                    } while (0);
                                    if (n) {
                                        m = c[a + (l + 28) >> 2] | 0;
                                        o = 5128 + (m << 2) | 0;
                                        if ((j | 0) == (c[o >> 2] | 0)) { c[o >> 2] = k; if (!k) { c[1207] = c[1207] & ~(1 << m); break } } else {
                                            if (n >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                            m = n + 16 | 0;
                                            if ((c[m >> 2] | 0) == (j | 0)) c[m >> 2] = k;
                                            else c[n + 20 >> 2] = k;
                                            if (!k) break
                                        }
                                        j = c[1210] | 0;
                                        if (k >>> 0 < j >>> 0) Wa();
                                        c[k + 24 >> 2] = n;
                                        m = c[a + (l + 16) >> 2] | 0;
                                        do {
                                            if (m)
                                                if (m >>> 0 < j >>> 0) Wa();
                                                else {
                                                    c[k + 16 >> 2] = m;
                                                    c[m + 24 >> 2] = k;
                                                    break
                                                }
                                        } while (0);
                                        j = c[a + (l + 20) >> 2] | 0;
                                        if (j)
                                            if (j >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                            else {
                                                c[k + 20 >> 2] = j;
                                                c[j + 24 >> 2] = k;
                                                break
                                            }
                                    }
                                } else {
                                    k = c[a + (l + 8) >> 2] | 0;
                                    l = c[a + (l + 12) >> 2] | 0;
                                    p = 4864 + (o << 1 << 2) | 0;
                                    if ((k | 0) != (p | 0)) { if (k >>> 0 < m >>> 0) Wa(); if ((c[k + 12 >> 2] | 0) != (j | 0)) Wa() }
                                    if ((l | 0) == (k | 0)) { c[1206] = c[1206] & ~(1 << o); break }
                                    if ((l | 0) != (p | 0)) {
                                        if (l >>> 0 < m >>> 0) Wa();
                                        m = l + 8 | 0;
                                        if ((c[m >> 2] | 0) == (j | 0)) n = m;
                                        else Wa()
                                    } else n = l + 8 | 0;
                                    c[k + 12 >> 2] = l;
                                    c[n >> 2] = k
                                }
                            } while (0);
                            if (h >>> 0 < 16) {
                                c[f >> 2] = g | e & 1 | 2;
                                r = a + (g | 4) | 0;
                                c[r >> 2] = c[r >> 2] | 1;
                                r = a;
                                i = d;
                                return r | 0
                            } else {
                                c[f >> 2] = e & 1 | b | 2;
                                c[a + (b + 4) >> 2] = h | 3;
                                r = a + (g | 4) | 0;
                                c[r >> 2] = c[r >> 2] | 1;
                                ge(a + b | 0, h);
                                r = a;
                                i = d;
                                return r | 0
                            }
                            return 0
                        }

                        function ge(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var d = 0,
                                e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0,
                                q = 0,
                                r = 0,
                                s = 0,
                                t = 0,
                                u = 0,
                                v = 0;
                            d = i;
                            h = a + b | 0;
                            l = c[a + 4 >> 2] | 0;
                            do {
                                if (!(l & 1)) {
                                    p = c[a >> 2] | 0;
                                    if (!(l & 3)) { i = d; return }
                                    l = a + (0 - p) | 0;
                                    m = p + b | 0;
                                    r = c[1210] | 0;
                                    if (l >>> 0 < r >>> 0) Wa();
                                    if ((l | 0) == (c[1211] | 0)) {
                                        e = a + (b + 4) | 0;
                                        n = c[e >> 2] | 0;
                                        if ((n & 3 | 0) != 3) {
                                            e = l;
                                            n = m;
                                            break
                                        }
                                        c[1208] = m;
                                        c[e >> 2] = n & -2;
                                        c[a + (4 - p) >> 2] = m | 1;
                                        c[h >> 2] = m;
                                        i = d;
                                        return
                                    }
                                    s = p >>> 3;
                                    if (p >>> 0 < 256) {
                                        e = c[a + (8 - p) >> 2] | 0;
                                        n = c[a + (12 - p) >> 2] | 0;
                                        o = 4864 + (s << 1 << 2) | 0;
                                        if ((e | 0) != (o | 0)) { if (e >>> 0 < r >>> 0) Wa(); if ((c[e + 12 >> 2] | 0) != (l | 0)) Wa() }
                                        if ((n | 0) == (e | 0)) {
                                            c[1206] = c[1206] & ~(1 << s);
                                            e = l;
                                            n = m;
                                            break
                                        }
                                        if ((n | 0) != (o | 0)) {
                                            if (n >>> 0 < r >>> 0) Wa();
                                            o = n + 8 | 0;
                                            if ((c[o >> 2] | 0) == (l | 0)) q = o;
                                            else Wa()
                                        } else q = n + 8 | 0;
                                        c[e + 12 >> 2] = n;
                                        c[q >> 2] = e;
                                        e = l;
                                        n = m;
                                        break
                                    }
                                    q = c[a + (24 - p) >> 2] | 0;
                                    s = c[a + (12 - p) >> 2] | 0;
                                    do {
                                        if ((s | 0) == (l | 0)) {
                                            u = 16 - p | 0;
                                            t = a + (u + 4) | 0;
                                            s = c[t >> 2] | 0;
                                            if (!s) {
                                                t = a + u | 0;
                                                s = c[t >> 2] | 0;
                                                if (!s) { o = 0; break }
                                            }
                                            while (1) {
                                                v = s + 20 | 0;
                                                u = c[v >> 2] | 0;
                                                if (u) {
                                                    s = u;
                                                    t = v;
                                                    continue
                                                }
                                                u = s + 16 | 0;
                                                v = c[u >> 2] | 0;
                                                if (!v) break;
                                                else {
                                                    s = v;
                                                    t = u
                                                }
                                            }
                                            if (t >>> 0 < r >>> 0) Wa();
                                            else {
                                                c[t >> 2] = 0;
                                                o = s;
                                                break
                                            }
                                        } else {
                                            t = c[a + (8 - p) >> 2] | 0;
                                            if (t >>> 0 < r >>> 0) Wa();
                                            r = t + 12 | 0;
                                            if ((c[r >> 2] | 0) != (l | 0)) Wa();
                                            u = s + 8 | 0;
                                            if ((c[u >> 2] | 0) == (l | 0)) {
                                                c[r >> 2] = s;
                                                c[u >> 2] = t;
                                                o = s;
                                                break
                                            } else Wa()
                                        }
                                    } while (0);
                                    if (q) {
                                        s = c[a + (28 - p) >> 2] | 0;
                                        r = 5128 + (s << 2) | 0;
                                        if ((l | 0) == (c[r >> 2] | 0)) {
                                            c[r >> 2] = o;
                                            if (!o) {
                                                c[1207] = c[1207] & ~(1 << s);
                                                e = l;
                                                n = m;
                                                break
                                            }
                                        } else {
                                            if (q >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                            r = q + 16 | 0;
                                            if ((c[r >> 2] | 0) == (l | 0)) c[r >> 2] = o;
                                            else c[q + 20 >> 2] = o;
                                            if (!o) {
                                                e = l;
                                                n = m;
                                                break
                                            }
                                        }
                                        r = c[1210] | 0;
                                        if (o >>> 0 < r >>> 0) Wa();
                                        c[o + 24 >> 2] = q;
                                        p = 16 - p | 0;
                                        q = c[a + p >> 2] | 0;
                                        do {
                                            if (q)
                                                if (q >>> 0 < r >>> 0) Wa();
                                                else {
                                                    c[o + 16 >> 2] = q;
                                                    c[q + 24 >> 2] = o;
                                                    break
                                                }
                                        } while (0);
                                        p = c[a + (p + 4) >> 2] | 0;
                                        if (p)
                                            if (p >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                            else {
                                                c[o + 20 >> 2] = p;
                                                c[p + 24 >> 2] = o;
                                                e = l;
                                                n = m;
                                                break
                                            }
                                        else {
                                            e = l;
                                            n = m
                                        }
                                    } else {
                                        e = l;
                                        n = m
                                    }
                                } else {
                                    e = a;
                                    n = b
                                }
                            } while (0);
                            l = c[1210] | 0;
                            if (h >>> 0 < l >>> 0) Wa();
                            m = a + (b + 4) | 0;
                            o = c[m >> 2] | 0;
                            if (!(o & 2)) {
                                if ((h | 0) == (c[1212] | 0)) {
                                    v = (c[1209] | 0) + n | 0;
                                    c[1209] = v;
                                    c[1212] = e;
                                    c[e + 4 >> 2] = v | 1;
                                    if ((e | 0) != (c[1211] | 0)) { i = d; return }
                                    c[1211] = 0;
                                    c[1208] = 0;
                                    i = d;
                                    return
                                }
                                if ((h | 0) == (c[1211] | 0)) {
                                    v = (c[1208] | 0) + n | 0;
                                    c[1208] = v;
                                    c[1211] = e;
                                    c[e + 4 >> 2] = v | 1;
                                    c[e + v >> 2] = v;
                                    i = d;
                                    return
                                }
                                n = (o & -8) + n | 0;
                                m = o >>> 3;
                                do {
                                    if (o >>> 0 >= 256) {
                                        k = c[a + (b + 24) >> 2] | 0;
                                        o = c[a + (b + 12) >> 2] | 0;
                                        do {
                                            if ((o | 0) == (h | 0)) {
                                                o = a + (b + 20) | 0;
                                                m = c[o >> 2] | 0;
                                                if (!m) {
                                                    o = a + (b + 16) | 0;
                                                    m = c[o >> 2] | 0;
                                                    if (!m) { j = 0; break }
                                                }
                                                while (1) {
                                                    p = m + 20 | 0;
                                                    q = c[p >> 2] | 0;
                                                    if (q) {
                                                        m = q;
                                                        o = p;
                                                        continue
                                                    }
                                                    q = m + 16 | 0;
                                                    p = c[q >> 2] | 0;
                                                    if (!p) break;
                                                    else {
                                                        m = p;
                                                        o = q
                                                    }
                                                }
                                                if (o >>> 0 < l >>> 0) Wa();
                                                else {
                                                    c[o >> 2] = 0;
                                                    j = m;
                                                    break
                                                }
                                            } else {
                                                m = c[a + (b + 8) >> 2] | 0;
                                                if (m >>> 0 < l >>> 0) Wa();
                                                p = m + 12 | 0;
                                                if ((c[p >> 2] | 0) != (h | 0)) Wa();
                                                l = o + 8 | 0;
                                                if ((c[l >> 2] | 0) == (h | 0)) {
                                                    c[p >> 2] = o;
                                                    c[l >> 2] = m;
                                                    j = o;
                                                    break
                                                } else Wa()
                                            }
                                        } while (0);
                                        if (k) {
                                            m = c[a + (b + 28) >> 2] | 0;
                                            l = 5128 + (m << 2) | 0;
                                            if ((h | 0) == (c[l >> 2] | 0)) { c[l >> 2] = j; if (!j) { c[1207] = c[1207] & ~(1 << m); break } } else {
                                                if (k >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                l = k + 16 | 0;
                                                if ((c[l >> 2] | 0) == (h | 0)) c[l >> 2] = j;
                                                else c[k + 20 >> 2] = j;
                                                if (!j) break
                                            }
                                            h = c[1210] | 0;
                                            if (j >>> 0 < h >>> 0) Wa();
                                            c[j + 24 >> 2] = k;
                                            k = c[a + (b + 16) >> 2] | 0;
                                            do {
                                                if (k)
                                                    if (k >>> 0 < h >>> 0) Wa();
                                                    else {
                                                        c[j + 16 >> 2] = k;
                                                        c[k + 24 >> 2] = j;
                                                        break
                                                    }
                                            } while (0);
                                            h = c[a + (b + 20) >> 2] | 0;
                                            if (h)
                                                if (h >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                                else {
                                                    c[j + 20 >> 2] = h;
                                                    c[h + 24 >> 2] = j;
                                                    break
                                                }
                                        }
                                    } else {
                                        j = c[a + (b + 8) >> 2] | 0;
                                        a = c[a + (b + 12) >> 2] | 0;
                                        b = 4864 + (m << 1 << 2) | 0;
                                        if ((j | 0) != (b | 0)) { if (j >>> 0 < l >>> 0) Wa(); if ((c[j + 12 >> 2] | 0) != (h | 0)) Wa() }
                                        if ((a | 0) == (j | 0)) { c[1206] = c[1206] & ~(1 << m); break }
                                        if ((a | 0) != (b | 0)) {
                                            if (a >>> 0 < l >>> 0) Wa();
                                            b = a + 8 | 0;
                                            if ((c[b >> 2] | 0) == (h | 0)) k = b;
                                            else Wa()
                                        } else k = a + 8 | 0;
                                        c[j + 12 >> 2] = a;
                                        c[k >> 2] = j
                                    }
                                } while (0);
                                c[e + 4 >> 2] = n | 1;
                                c[e + n >> 2] = n;
                                if ((e | 0) == (c[1211] | 0)) {
                                    c[1208] = n;
                                    i = d;
                                    return
                                }
                            } else {
                                c[m >> 2] = o & -2;
                                c[e + 4 >> 2] = n | 1;
                                c[e + n >> 2] = n
                            }
                            b = n >>> 3;
                            if (n >>> 0 < 256) {
                                a = b << 1;
                                h = 4864 + (a << 2) | 0;
                                j = c[1206] | 0;
                                b = 1 << b;
                                if (j & b) {
                                    a = 4864 + (a + 2 << 2) | 0;
                                    j = c[a >> 2] | 0;
                                    if (j >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                    else {
                                        g = a;
                                        f = j
                                    }
                                } else {
                                    c[1206] = j | b;
                                    g = 4864 + (a + 2 << 2) | 0;
                                    f = h
                                }
                                c[g >> 2] = e;
                                c[f + 12 >> 2] = e;
                                c[e + 8 >> 2] = f;
                                c[e + 12 >> 2] = h;
                                i = d;
                                return
                            }
                            f = n >>> 8;
                            if (f)
                                if (n >>> 0 > 16777215) f = 31;
                                else {
                                    u = (f + 1048320 | 0) >>> 16 & 8;
                                    v = f << u;
                                    t = (v + 520192 | 0) >>> 16 & 4;
                                    v = v << t;
                                    f = (v + 245760 | 0) >>> 16 & 2;
                                    f = 14 - (t | u | f) + (v << f >>> 15) | 0;
                                    f = n >>> (f + 7 | 0) & 1 | f << 1
                                }
                            else f = 0;
                            g = 5128 + (f << 2) | 0;
                            c[e + 28 >> 2] = f;
                            c[e + 20 >> 2] = 0;
                            c[e + 16 >> 2] = 0;
                            a = c[1207] | 0;
                            h = 1 << f;
                            if (!(a & h)) {
                                c[1207] = a | h;
                                c[g >> 2] = e;
                                c[e + 24 >> 2] = g;
                                c[e + 12 >> 2] = e;
                                c[e + 8 >> 2] = e;
                                i = d;
                                return
                            }
                            g = c[g >> 2] | 0;
                            if ((f | 0) == 31) f = 0;
                            else f = 25 - (f >>> 1) | 0;
                            a: do {
                                if ((c[g + 4 >> 2] & -8 | 0) != (n | 0)) {
                                    f = n << f;
                                    a = g;
                                    while (1) {
                                        h = a + (f >>> 31 << 2) + 16 | 0;
                                        g = c[h >> 2] | 0;
                                        if (!g) break;
                                        if ((c[g + 4 >> 2] & -8 | 0) == (n | 0)) break a;
                                        else {
                                            f = f << 1;
                                            a = g
                                        }
                                    }
                                    if (h >>> 0 < (c[1210] | 0) >>> 0) Wa();
                                    c[h >> 2] = e;
                                    c[e + 24 >> 2] = a;
                                    c[e + 12 >> 2] = e;
                                    c[e + 8 >> 2] = e;
                                    i = d;
                                    return
                                }
                            } while (0);
                            f = g + 8 | 0;
                            h = c[f >> 2] | 0;
                            v = c[1210] | 0;
                            if (!(g >>> 0 >= v >>> 0 & h >>> 0 >= v >>> 0)) Wa();
                            c[h + 12 >> 2] = e;
                            c[f >> 2] = e;
                            c[e + 8 >> 2] = h;
                            c[e + 12 >> 2] = g;
                            c[e + 24 >> 2] = 0;
                            i = d;
                            return
                        }

                        function he(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0;
                            e = i;
                            g = a + 4 | 0;
                            h = c[g >> 2] | 0;
                            f = a + 100 | 0;
                            if (h >>> 0 < (c[f >> 2] | 0) >>> 0) {
                                c[g >> 2] = h + 1;
                                j = d[h >> 0] | 0
                            } else j = Zd(a) | 0;
                            if ((j | 0) == 43 | (j | 0) == 45) {
                                k = c[g >> 2] | 0;
                                h = (j | 0) == 45 & 1;
                                if (k >>> 0 < (c[f >> 2] | 0) >>> 0) {
                                    c[g >> 2] = k + 1;
                                    j = d[k >> 0] | 0
                                } else j = Zd(a) | 0;
                                if ((j + -48 | 0) >>> 0 > 9 & (b | 0) != 0 ? (c[f >> 2] | 0) != 0 : 0) c[g >> 2] = (c[g >> 2] | 0) + -1
                            } else h = 0;
                            if ((j + -48 | 0) >>> 0 > 9) {
                                if (!(c[f >> 2] | 0)) {
                                    j = -2147483648;
                                    k = 0;
                                    F = j;
                                    i = e;
                                    return k | 0
                                }
                                c[g >> 2] = (c[g >> 2] | 0) + -1;
                                j = -2147483648;
                                k = 0;
                                F = j;
                                i = e;
                                return k | 0
                            } else b = 0;
                            do {
                                b = j + -48 + (b * 10 | 0) | 0;
                                j = c[g >> 2] | 0;
                                if (j >>> 0 < (c[f >> 2] | 0) >>> 0) {
                                    c[g >> 2] = j + 1;
                                    j = d[j >> 0] | 0
                                } else j = Zd(a) | 0
                            } while ((j + -48 | 0) >>> 0 < 10 & (b | 0) < 214748364);
                            k = ((b | 0) < 0) << 31 >> 31;
                            if ((j + -48 | 0) >>> 0 < 10)
                                do {
                                    k = we(b | 0, k | 0, 10, 0) | 0;
                                    b = F;
                                    j = ne(j | 0, ((j | 0) < 0) << 31 >> 31 | 0, -48, -1) | 0;
                                    b = ne(j | 0, F | 0, k | 0, b | 0) | 0;
                                    k = F;
                                    j = c[g >> 2] | 0;
                                    if (j >>> 0 < (c[f >> 2] | 0) >>> 0) {
                                        c[g >> 2] = j + 1;
                                        j = d[j >> 0] | 0
                                    } else j = Zd(a) | 0
                                } while ((j + -48 | 0) >>> 0 < 10 & ((k | 0) < 21474836 | (k | 0) == 21474836 & b >>> 0 < 2061584302));
                            if ((j + -48 | 0) >>> 0 < 10)
                                do {
                                    j = c[g >> 2] | 0;
                                    if (j >>> 0 < (c[f >> 2] | 0) >>> 0) {
                                        c[g >> 2] = j + 1;
                                        j = d[j >> 0] | 0
                                    } else j = Zd(a) | 0
                                } while ((j + -48 | 0) >>> 0 < 10);
                            if (c[f >> 2] | 0) c[g >> 2] = (c[g >> 2] | 0) + -1;
                            g = (h | 0) != 0;
                            h = je(0, 0, b | 0, k | 0) | 0;
                            j = g ? F : k;
                            k = g ? h : b;
                            F = j;
                            i = e;
                            return k | 0
                        }

                        function ie() {}

                        function je(a, b, c, d) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            b = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0;
                            return (F = b, a - c >>> 0 | 0) | 0
                        }

                        function ke(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                i = 0;
                            f = b + e | 0;
                            if ((e | 0) >= 20) {
                                d = d & 255;
                                i = b & 3;
                                h = d | d << 8 | d << 16 | d << 24;
                                g = f & ~3;
                                if (i) {
                                    i = b + 4 - i | 0;
                                    while ((b | 0) < (i | 0)) {
                                        a[b >> 0] = d;
                                        b = b + 1 | 0
                                    }
                                }
                                while ((b | 0) < (g | 0)) {
                                    c[b >> 2] = h;
                                    b = b + 4 | 0
                                }
                            }
                            while ((b | 0) < (f | 0)) {
                                a[b >> 0] = d;
                                b = b + 1 | 0
                            }
                            return b - e | 0
                        }

                        function le(a, b, c) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            if ((c | 0) < 32) { F = b << c | (a & (1 << c) - 1 << 32 - c) >>> 32 - c; return a << c }
                            F = a << c - 32;
                            return 0
                        }

                        function me(b) {
                            b = b | 0;
                            var c = 0;
                            c = b;
                            while (a[c >> 0] | 0) c = c + 1 | 0;
                            return c - b | 0
                        }

                        function ne(a, b, c, d) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            c = a + c >>> 0;
                            return (F = b + d + (c >>> 0 < a >>> 0 | 0) >>> 0, c | 0) | 0
                        }

                        function oe(a, b, c) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            if ((c | 0) < 32) { F = b >>> c; return a >>> c | (b & (1 << c) - 1) << 32 - c }
                            F = 0;
                            return b >>> c - 32 | 0
                        }

                        function pe(b, d, e) {
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0;
                            if ((e | 0) >= 4096) return Ca(b | 0, d | 0, e | 0) | 0;
                            f = b | 0;
                            if ((b & 3) == (d & 3)) {
                                while (b & 3) {
                                    if (!e) return f | 0;
                                    a[b >> 0] = a[d >> 0] | 0;
                                    b = b + 1 | 0;
                                    d = d + 1 | 0;
                                    e = e - 1 | 0
                                }
                                while ((e | 0) >= 4) {
                                    c[b >> 2] = c[d >> 2];
                                    b = b + 4 | 0;
                                    d = d + 4 | 0;
                                    e = e - 4 | 0
                                }
                            }
                            while ((e | 0) > 0) {
                                a[b >> 0] = a[d >> 0] | 0;
                                b = b + 1 | 0;
                                d = d + 1 | 0;
                                e = e - 1 | 0
                            }
                            return f | 0
                        }

                        function qe(a, b, c) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            if ((c | 0) < 32) { F = b >> c; return a >>> c | (b & (1 << c) - 1) << 32 - c }
                            F = (b | 0) < 0 ? -1 : 0;
                            return b >> c - 32 | 0
                        }

                        function re(b) {
                            b = b | 0;
                            var c = 0;
                            c = a[n + (b >>> 24) >> 0] | 0;
                            if ((c | 0) < 8) return c | 0;
                            c = a[n + (b >> 16 & 255) >> 0] | 0;
                            if ((c | 0) < 8) return c + 8 | 0;
                            c = a[n + (b >> 8 & 255) >> 0] | 0;
                            if ((c | 0) < 8) return c + 16 | 0;
                            return (a[n + (b & 255) >> 0] | 0) + 24 | 0
                        }

                        function se(b) {
                            b = b | 0;
                            var c = 0;
                            c = a[m + (b & 255) >> 0] | 0;
                            if ((c | 0) < 8) return c | 0;
                            c = a[m + (b >> 8 & 255) >> 0] | 0;
                            if ((c | 0) < 8) return c + 8 | 0;
                            c = a[m + (b >> 16 & 255) >> 0] | 0;
                            if ((c | 0) < 8) return c + 16 | 0;
                            return (a[m + (b >>> 24) >> 0] | 0) + 24 | 0
                        }

                        function te(a, b) {
                            a = a | 0;
                            b = b | 0;
                            var c = 0,
                                d = 0,
                                e = 0,
                                f = 0;
                            f = a & 65535;
                            d = b & 65535;
                            c = ba(d, f) | 0;
                            e = a >>> 16;
                            d = (c >>> 16) + (ba(d, e) | 0) | 0;
                            b = b >>> 16;
                            a = ba(b, f) | 0;
                            return (F = (d >>> 16) + (ba(b, e) | 0) + (((d & 65535) + a | 0) >>> 16) | 0, d + a << 16 | c & 65535 | 0) | 0
                        }

                        function ue(a, b, c, d) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0,
                                g = 0,
                                h = 0,
                                i = 0,
                                j = 0;
                            j = b >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
                            i = ((b | 0) < 0 ? -1 : 0) >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
                            f = d >> 31 | ((d | 0) < 0 ? -1 : 0) << 1;
                            e = ((d | 0) < 0 ? -1 : 0) >> 31 | ((d | 0) < 0 ? -1 : 0) << 1;
                            h = je(j ^ a, i ^ b, j, i) | 0;
                            g = F;
                            b = f ^ j;
                            a = e ^ i;
                            a = je((ze(h, g, je(f ^ c, e ^ d, f, e) | 0, F, 0) | 0) ^ b, F ^ a, b, a) | 0;
                            return a | 0
                        }

                        function ve(a, b, d, e) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0,
                                h = 0,
                                j = 0,
                                k = 0,
                                l = 0;
                            f = i;
                            i = i + 8 | 0;
                            j = f | 0;
                            h = b >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
                            g = ((b | 0) < 0 ? -1 : 0) >> 31 | ((b | 0) < 0 ? -1 : 0) << 1;
                            l = e >> 31 | ((e | 0) < 0 ? -1 : 0) << 1;
                            k = ((e | 0) < 0 ? -1 : 0) >> 31 | ((e | 0) < 0 ? -1 : 0) << 1;
                            b = je(h ^ a, g ^ b, h, g) | 0;
                            a = F;
                            ze(b, a, je(l ^ d, k ^ e, l, k) | 0, F, j) | 0;
                            a = je(c[j >> 2] ^ h, c[j + 4 >> 2] ^ g, h, g) | 0;
                            b = F;
                            i = f;
                            return (F = b, a) | 0
                        }

                        function we(a, b, c, d) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            var e = 0,
                                f = 0;
                            e = a;
                            f = c;
                            a = te(e, f) | 0;
                            c = F;
                            return (F = (ba(b, f) | 0) + (ba(d, e) | 0) + c | c & 0, a | 0 | 0) | 0
                        }

                        function xe(a, b, c, d) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            a = ze(a, b, c, d, 0) | 0;
                            return a | 0
                        }

                        function ye(a, b, d, e) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            var f = 0,
                                g = 0;
                            g = i;
                            i = i + 8 | 0;
                            f = g | 0;
                            ze(a, b, d, e, f) | 0;
                            i = g;
                            return (F = c[f + 4 >> 2] | 0, c[f >> 2] | 0) | 0
                        }

                        function ze(a, b, d, e, f) {
                            a = a | 0;
                            b = b | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            var g = 0,
                                h = 0,
                                i = 0,
                                j = 0,
                                k = 0,
                                l = 0,
                                m = 0,
                                n = 0,
                                o = 0,
                                p = 0;
                            h = a;
                            j = b;
                            i = j;
                            l = d;
                            g = e;
                            k = g;
                            if (!i) {
                                g = (f | 0) != 0;
                                if (!k) {
                                    if (g) {
                                        c[f >> 2] = (h >>> 0) % (l >>> 0);
                                        c[f + 4 >> 2] = 0
                                    }
                                    k = 0;
                                    m = (h >>> 0) / (l >>> 0) >>> 0;
                                    return (F = k, m) | 0
                                } else {
                                    if (!g) {
                                        l = 0;
                                        m = 0;
                                        return (F = l, m) | 0
                                    }
                                    c[f >> 2] = a | 0;
                                    c[f + 4 >> 2] = b & 0;
                                    l = 0;
                                    m = 0;
                                    return (F = l, m) | 0
                                }
                            }
                            m = (k | 0) == 0;
                            do {
                                if (l) {
                                    if (!m) {
                                        k = (re(k | 0) | 0) - (re(i | 0) | 0) | 0;
                                        if (k >>> 0 <= 31) {
                                            m = k + 1 | 0;
                                            l = 31 - k | 0;
                                            a = k - 31 >> 31;
                                            j = m;
                                            b = h >>> (m >>> 0) & a | i << l;
                                            a = i >>> (m >>> 0) & a;
                                            k = 0;
                                            l = h << l;
                                            break
                                        }
                                        if (!f) {
                                            l = 0;
                                            m = 0;
                                            return (F = l, m) | 0
                                        }
                                        c[f >> 2] = a | 0;
                                        c[f + 4 >> 2] = j | b & 0;
                                        l = 0;
                                        m = 0;
                                        return (F = l, m) | 0
                                    }
                                    k = l - 1 | 0;
                                    if (k & l) {
                                        l = (re(l | 0) | 0) + 33 - (re(i | 0) | 0) | 0;
                                        p = 64 - l | 0;
                                        m = 32 - l | 0;
                                        n = m >> 31;
                                        o = l - 32 | 0;
                                        a = o >> 31;
                                        j = l;
                                        b = m - 1 >> 31 & i >>> (o >>> 0) | (i << m | h >>> (l >>> 0)) & a;
                                        a = a & i >>> (l >>> 0);
                                        k = h << p & n;
                                        l = (i << p | h >>> (o >>> 0)) & n | h << m & l - 33 >> 31;
                                        break
                                    }
                                    if (f) {
                                        c[f >> 2] = k & h;
                                        c[f + 4 >> 2] = 0
                                    }
                                    if ((l | 0) == 1) {
                                        o = j | b & 0;
                                        p = a | 0 | 0;
                                        return (F = o, p) | 0
                                    } else {
                                        p = se(l | 0) | 0;
                                        o = i >>> (p >>> 0) | 0;
                                        p = i << 32 - p | h >>> (p >>> 0) | 0;
                                        return (F = o, p) | 0
                                    }
                                } else {
                                    if (m) {
                                        if (f) {
                                            c[f >> 2] = (i >>> 0) % (l >>> 0);
                                            c[f + 4 >> 2] = 0
                                        }
                                        o = 0;
                                        p = (i >>> 0) / (l >>> 0) >>> 0;
                                        return (F = o, p) | 0
                                    }
                                    if (!h) {
                                        if (f) {
                                            c[f >> 2] = 0;
                                            c[f + 4 >> 2] = (i >>> 0) % (k >>> 0)
                                        }
                                        o = 0;
                                        p = (i >>> 0) / (k >>> 0) >>> 0;
                                        return (F = o, p) | 0
                                    }
                                    l = k - 1 | 0;
                                    if (!(l & k)) {
                                        if (f) {
                                            c[f >> 2] = a | 0;
                                            c[f + 4 >> 2] = l & i | b & 0
                                        }
                                        o = 0;
                                        p = i >>> ((se(k | 0) | 0) >>> 0);
                                        return (F = o, p) | 0
                                    }
                                    k = (re(k | 0) | 0) - (re(i | 0) | 0) | 0;
                                    if (k >>> 0 <= 30) {
                                        a = k + 1 | 0;
                                        l = 31 - k | 0;
                                        j = a;
                                        b = i << l | h >>> (a >>> 0);
                                        a = i >>> (a >>> 0);
                                        k = 0;
                                        l = h << l;
                                        break
                                    }
                                    if (!f) {
                                        o = 0;
                                        p = 0;
                                        return (F = o, p) | 0
                                    }
                                    c[f >> 2] = a | 0;
                                    c[f + 4 >> 2] = j | b & 0;
                                    o = 0;
                                    p = 0;
                                    return (F = o, p) | 0
                                }
                            } while (0);
                            if (!j) {
                                g = l;
                                e = 0;
                                i = 0
                            } else {
                                h = d | 0 | 0;
                                g = g | e & 0;
                                e = ne(h, g, -1, -1) | 0;
                                d = F;
                                i = 0;
                                do {
                                    m = l;
                                    l = k >>> 31 | l << 1;
                                    k = i | k << 1;
                                    m = b << 1 | m >>> 31 | 0;
                                    n = b >>> 31 | a << 1 | 0;
                                    je(e, d, m, n) | 0;
                                    p = F;
                                    o = p >> 31 | ((p | 0) < 0 ? -1 : 0) << 1;
                                    i = o & 1;
                                    b = je(m, n, o & h, (((p | 0) < 0 ? -1 : 0) >> 31 | ((p | 0) < 0 ? -1 : 0) << 1) & g) | 0;
                                    a = F;
                                    j = j - 1 | 0
                                } while ((j | 0) != 0);
                                g = l;
                                e = 0
                            }
                            h = 0;
                            if (f) {
                                c[f >> 2] = b;
                                c[f + 4 >> 2] = a
                            }
                            o = (k | 0) >>> 31 | (g | h) << 1 | (h << 1 | k >>> 31) & 0 | e;
                            p = (k << 1 | 0 >>> 31) & -2 | i;
                            return (F = o, p) | 0
                        }

                        function Ae(a, b, c, d) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            return eb[a & 1](b | 0, c | 0, d | 0) | 0
                        }

                        function Be(a, b, c, d, e, f) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            fb[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0)
                        }

                        function Ce(a, b) {
                            a = a | 0;
                            b = b | 0;
                            gb[a & 31](b | 0)
                        }

                        function De(a, b, c) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            hb[a & 3](b | 0, c | 0)
                        }

                        function Ee(a, b) {
                            a = a | 0;
                            b = b | 0;
                            return ib[a & 1](b | 0) | 0
                        }

                        function Fe(a) {
                            a = a | 0;
                            jb[a & 3]()
                        }

                        function Ge(a, b, c, d, e, f, g) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            g = g | 0;
                            kb[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0)
                        }

                        function He(a, b, c) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            return lb[a & 3](b | 0, c | 0) | 0
                        }

                        function Ie(a, b, c, d, e) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            e = e | 0;
                            mb[a & 3](b | 0, c | 0, d | 0, e | 0)
                        }

                        function Je(a, b, c) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            ca(0);
                            return 0
                        }

                        function Ke(a, b, c, d, e) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            e = e | 0;
                            ca(1)
                        }

                        function Le(a) {
                            a = a | 0;
                            ca(2)
                        }

                        function Me(a, b) {
                            a = a | 0;
                            b = b | 0;
                            ca(3)
                        }

                        function Ne(a) {
                            a = a | 0;
                            ca(4);
                            return 0
                        }

                        function Oe() { ca(5) }

                        function Pe() { bb() }

                        function Qe(a, b, c, d, e, f) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            e = e | 0;
                            f = f | 0;
                            ca(6)
                        }

                        function Re(a, b) {
                            a = a | 0;
                            b = b | 0;
                            ca(7);
                            return 0
                        }

                        function Se(a, b, c, d) {
                            a = a | 0;
                            b = b | 0;
                            c = c | 0;
                            d = d | 0;
                            ca(8)
                        }
                        var eb = [Je, Dd];
                        var fb = [Ke, Kd, Jd, Ke];
                        var gb = [Le, wb, yb, Ab, Db, Ib, Hb, bc, dc, zc, yc, Oc, rd, qd, yd, Bd, zd, Ad, Cd, zb, Rd, Le, Le, Le, Le, Le, Le, Le, Le, Le, Le, Le];
                        var hb = [Me, Cb, Fb, fc];
                        var ib = [Ne, sd];
                        var jb = [Oe, Pe, Pd, Qd];
                        var kb = [Qe, Md, Ld, Qe];
                        var lb = [Re, Bb, Eb, ec];
                        var mb = [Se, Fd, Gd, Se];
                        return { _yo: $c, _strlen: me, _retireVar: id, _bitshift64Lshr: oe, _unyo: ad, _solve: ed, _bitshift64Shl: le, _getSolution: fd, ___cxa_is_pointer_type: Od, _memset: ke, _getNumVars: gd, _memcpy: pe, _getConflictClauseSize: jd, _addClause: dd, _i64Subtract: je, _createTheSolver: bd, _realloc: Ud, _i64Add: ne, _solveAssuming: hd, ___cxa_can_catch: Nd, _ensureVar: cd, _getConflictClause: kd, _free: Td, _malloc: Sd, __GLOBAL__I_a: cc, __GLOBAL__I_a127: Pc, runPostSets: ie, stackAlloc: nb, stackSave: ob, stackRestore: pb, setThrew: qb, setTempRet0: tb, getTempRet0: ub, dynCall_iiii: Ae, dynCall_viiiii: Be, dynCall_vi: Ce, dynCall_vii: De, dynCall_ii: Ee, dynCall_v: Fe, dynCall_viiiiii: Ge, dynCall_iii: He, dynCall_viiii: Ie }
                    }(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
                    var _yo = Module["_yo"] = asm["_yo"];
                    var _strlen = Module["_strlen"] = asm["_strlen"];
                    var _retireVar = Module["_retireVar"] = asm["_retireVar"];
                    var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
                    var _unyo = Module["_unyo"] = asm["_unyo"];
                    var _solve = Module["_solve"] = asm["_solve"];
                    var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
                    var _getSolution = Module["_getSolution"] = asm["_getSolution"];
                    var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
                    var _memset = Module["_memset"] = asm["_memset"];
                    var _getNumVars = Module["_getNumVars"] = asm["_getNumVars"];
                    var _memcpy = Module["_memcpy"] = asm["_memcpy"];
                    var _getConflictClauseSize = Module["_getConflictClauseSize"] = asm["_getConflictClauseSize"];
                    var _addClause = Module["_addClause"] = asm["_addClause"];
                    var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
                    var _createTheSolver = Module["_createTheSolver"] = asm["_createTheSolver"];
                    var _realloc = Module["_realloc"] = asm["_realloc"];
                    var _i64Add = Module["_i64Add"] = asm["_i64Add"];
                    var _solveAssuming = Module["_solveAssuming"] = asm["_solveAssuming"];
                    var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
                    var _ensureVar = Module["_ensureVar"] = asm["_ensureVar"];
                    var _getConflictClause = Module["_getConflictClause"] = asm["_getConflictClause"];
                    var _free = Module["_free"] = asm["_free"];
                    var _malloc = Module["_malloc"] = asm["_malloc"];
                    var __GLOBAL__I_a = Module["__GLOBAL__I_a"] = asm["__GLOBAL__I_a"];
                    var __GLOBAL__I_a127 = Module["__GLOBAL__I_a127"] = asm["__GLOBAL__I_a127"];
                    var runPostSets = Module["runPostSets"] = asm["runPostSets"];
                    var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
                    var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
                    var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
                    var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
                    var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
                    var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
                    var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
                    var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
                    var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
                    Runtime.stackAlloc = asm["stackAlloc"];
                    Runtime.stackSave = asm["stackSave"];
                    Runtime.stackRestore = asm["stackRestore"];
                    Runtime.setTempRet0 = asm["setTempRet0"];
                    Runtime.getTempRet0 = asm["getTempRet0"];
                    var i64Math = function() {
                        var goog = { math: {} };
                        goog.math.Long = function(low, high) {
                            this.low_ = low | 0;
                            this.high_ = high | 0
                        };
                        goog.math.Long.IntCache_ = {};
                        goog.math.Long.fromInt = function(value) { if (-128 <= value && value < 128) { var cachedObj = goog.math.Long.IntCache_[value]; if (cachedObj) { return cachedObj } } var obj = new goog.math.Long(value | 0, value < 0 ? -1 : 0); if (-128 <= value && value < 128) { goog.math.Long.IntCache_[value] = obj } return obj };
                        goog.math.Long.fromNumber = function(value) { if (isNaN(value) || !isFinite(value)) { return goog.math.Long.ZERO } else if (value <= -goog.math.Long.TWO_PWR_63_DBL_) { return goog.math.Long.MIN_VALUE } else if (value + 1 >= goog.math.Long.TWO_PWR_63_DBL_) { return goog.math.Long.MAX_VALUE } else if (value < 0) { return goog.math.Long.fromNumber(-value).negate() } else { return new goog.math.Long(value % goog.math.Long.TWO_PWR_32_DBL_ | 0, value / goog.math.Long.TWO_PWR_32_DBL_ | 0) } };
                        goog.math.Long.fromBits = function(lowBits, highBits) { return new goog.math.Long(lowBits, highBits) };
                        goog.math.Long.fromString = function(str, opt_radix) {
                            if (str.length == 0) { throw Error("number format error: empty string") }
                            var radix = opt_radix || 10;
                            if (radix < 2 || 36 < radix) { throw Error("radix out of range: " + radix) }
                            if (str.charAt(0) == "-") { return goog.math.Long.fromString(str.substring(1), radix).negate() } else if (str.indexOf("-") >= 0) { throw Error('number format error: interior "-" character: ' + str) }
                            var radixToPower = goog.math.Long.fromNumber(Math.pow(radix, 8));
                            var result = goog.math.Long.ZERO;
                            for (var i = 0; i < str.length; i += 8) {
                                var size = Math.min(8, str.length - i);
                                var value = parseInt(str.substring(i, i + size), radix);
                                if (size < 8) {
                                    var power = goog.math.Long.fromNumber(Math.pow(radix, size));
                                    result = result.multiply(power).add(goog.math.Long.fromNumber(value))
                                } else {
                                    result = result.multiply(radixToPower);
                                    result = result.add(goog.math.Long.fromNumber(value))
                                }
                            }
                            return result
                        };
                        goog.math.Long.TWO_PWR_16_DBL_ = 1 << 16;
                        goog.math.Long.TWO_PWR_24_DBL_ = 1 << 24;
                        goog.math.Long.TWO_PWR_32_DBL_ = goog.math.Long.TWO_PWR_16_DBL_ * goog.math.Long.TWO_PWR_16_DBL_;
                        goog.math.Long.TWO_PWR_31_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ / 2;
                        goog.math.Long.TWO_PWR_48_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ * goog.math.Long.TWO_PWR_16_DBL_;
                        goog.math.Long.TWO_PWR_64_DBL_ = goog.math.Long.TWO_PWR_32_DBL_ * goog.math.Long.TWO_PWR_32_DBL_;
                        goog.math.Long.TWO_PWR_63_DBL_ = goog.math.Long.TWO_PWR_64_DBL_ / 2;
                        goog.math.Long.ZERO = goog.math.Long.fromInt(0);
                        goog.math.Long.ONE = goog.math.Long.fromInt(1);
                        goog.math.Long.NEG_ONE = goog.math.Long.fromInt(-1);
                        goog.math.Long.MAX_VALUE = goog.math.Long.fromBits(4294967295 | 0, 2147483647 | 0);
                        goog.math.Long.MIN_VALUE = goog.math.Long.fromBits(0, 2147483648 | 0);
                        goog.math.Long.TWO_PWR_24_ = goog.math.Long.fromInt(1 << 24);
                        goog.math.Long.prototype.toInt = function() { return this.low_ };
                        goog.math.Long.prototype.toNumber = function() { return this.high_ * goog.math.Long.TWO_PWR_32_DBL_ + this.getLowBitsUnsigned() };
                        goog.math.Long.prototype.toString = function(opt_radix) {
                            var radix = opt_radix || 10;
                            if (radix < 2 || 36 < radix) { throw Error("radix out of range: " + radix) }
                            if (this.isZero()) { return "0" }
                            if (this.isNegative()) { if (this.equals(goog.math.Long.MIN_VALUE)) { var radixLong = goog.math.Long.fromNumber(radix); var div = this.div(radixLong); var rem = div.multiply(radixLong).subtract(this); return div.toString(radix) + rem.toInt().toString(radix) } else { return "-" + this.negate().toString(radix) } }
                            var radixToPower = goog.math.Long.fromNumber(Math.pow(radix, 6));
                            var rem = this;
                            var result = "";
                            while (true) {
                                var remDiv = rem.div(radixToPower);
                                var intval = rem.subtract(remDiv.multiply(radixToPower)).toInt();
                                var digits = intval.toString(radix);
                                rem = remDiv;
                                if (rem.isZero()) { return digits + result } else {
                                    while (digits.length < 6) { digits = "0" + digits }
                                    result = "" + digits + result
                                }
                            }
                        };
                        goog.math.Long.prototype.getHighBits = function() { return this.high_ };
                        goog.math.Long.prototype.getLowBits = function() { return this.low_ };
                        goog.math.Long.prototype.getLowBitsUnsigned = function() { return this.low_ >= 0 ? this.low_ : goog.math.Long.TWO_PWR_32_DBL_ + this.low_ };
                        goog.math.Long.prototype.getNumBitsAbs = function() { if (this.isNegative()) { if (this.equals(goog.math.Long.MIN_VALUE)) { return 64 } else { return this.negate().getNumBitsAbs() } } else { var val = this.high_ != 0 ? this.high_ : this.low_; for (var bit = 31; bit > 0; bit--) { if ((val & 1 << bit) != 0) { break } } return this.high_ != 0 ? bit + 33 : bit + 1 } };
                        goog.math.Long.prototype.isZero = function() { return this.high_ == 0 && this.low_ == 0 };
                        goog.math.Long.prototype.isNegative = function() { return this.high_ < 0 };
                        goog.math.Long.prototype.isOdd = function() { return (this.low_ & 1) == 1 };
                        goog.math.Long.prototype.equals = function(other) { return this.high_ == other.high_ && this.low_ == other.low_ };
                        goog.math.Long.prototype.notEquals = function(other) { return this.high_ != other.high_ || this.low_ != other.low_ };
                        goog.math.Long.prototype.lessThan = function(other) { return this.compare(other) < 0 };
                        goog.math.Long.prototype.lessThanOrEqual = function(other) { return this.compare(other) <= 0 };
                        goog.math.Long.prototype.greaterThan = function(other) { return this.compare(other) > 0 };
                        goog.math.Long.prototype.greaterThanOrEqual = function(other) { return this.compare(other) >= 0 };
                        goog.math.Long.prototype.compare = function(other) { if (this.equals(other)) { return 0 } var thisNeg = this.isNegative(); var otherNeg = other.isNegative(); if (thisNeg && !otherNeg) { return -1 } if (!thisNeg && otherNeg) { return 1 } if (this.subtract(other).isNegative()) { return -1 } else { return 1 } };
                        goog.math.Long.prototype.negate = function() { if (this.equals(goog.math.Long.MIN_VALUE)) { return goog.math.Long.MIN_VALUE } else { return this.not().add(goog.math.Long.ONE) } };
                        goog.math.Long.prototype.add = function(other) {
                            var a48 = this.high_ >>> 16;
                            var a32 = this.high_ & 65535;
                            var a16 = this.low_ >>> 16;
                            var a00 = this.low_ & 65535;
                            var b48 = other.high_ >>> 16;
                            var b32 = other.high_ & 65535;
                            var b16 = other.low_ >>> 16;
                            var b00 = other.low_ & 65535;
                            var c48 = 0,
                                c32 = 0,
                                c16 = 0,
                                c00 = 0;
                            c00 += a00 + b00;
                            c16 += c00 >>> 16;
                            c00 &= 65535;
                            c16 += a16 + b16;
                            c32 += c16 >>> 16;
                            c16 &= 65535;
                            c32 += a32 + b32;
                            c48 += c32 >>> 16;
                            c32 &= 65535;
                            c48 += a48 + b48;
                            c48 &= 65535;
                            return goog.math.Long.fromBits(c16 << 16 | c00, c48 << 16 | c32)
                        };
                        goog.math.Long.prototype.subtract = function(other) { return this.add(other.negate()) };
                        goog.math.Long.prototype.multiply = function(other) {
                            if (this.isZero()) { return goog.math.Long.ZERO } else if (other.isZero()) { return goog.math.Long.ZERO }
                            if (this.equals(goog.math.Long.MIN_VALUE)) { return other.isOdd() ? goog.math.Long.MIN_VALUE : goog.math.Long.ZERO } else if (other.equals(goog.math.Long.MIN_VALUE)) { return this.isOdd() ? goog.math.Long.MIN_VALUE : goog.math.Long.ZERO }
                            if (this.isNegative()) { if (other.isNegative()) { return this.negate().multiply(other.negate()) } else { return this.negate().multiply(other).negate() } } else if (other.isNegative()) { return this.multiply(other.negate()).negate() }
                            if (this.lessThan(goog.math.Long.TWO_PWR_24_) && other.lessThan(goog.math.Long.TWO_PWR_24_)) { return goog.math.Long.fromNumber(this.toNumber() * other.toNumber()) }
                            var a48 = this.high_ >>> 16;
                            var a32 = this.high_ & 65535;
                            var a16 = this.low_ >>> 16;
                            var a00 = this.low_ & 65535;
                            var b48 = other.high_ >>> 16;
                            var b32 = other.high_ & 65535;
                            var b16 = other.low_ >>> 16;
                            var b00 = other.low_ & 65535;
                            var c48 = 0,
                                c32 = 0,
                                c16 = 0,
                                c00 = 0;
                            c00 += a00 * b00;
                            c16 += c00 >>> 16;
                            c00 &= 65535;
                            c16 += a16 * b00;
                            c32 += c16 >>> 16;
                            c16 &= 65535;
                            c16 += a00 * b16;
                            c32 += c16 >>> 16;
                            c16 &= 65535;
                            c32 += a32 * b00;
                            c48 += c32 >>> 16;
                            c32 &= 65535;
                            c32 += a16 * b16;
                            c48 += c32 >>> 16;
                            c32 &= 65535;
                            c32 += a00 * b32;
                            c48 += c32 >>> 16;
                            c32 &= 65535;
                            c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
                            c48 &= 65535;
                            return goog.math.Long.fromBits(c16 << 16 | c00, c48 << 16 | c32)
                        };
                        goog.math.Long.prototype.div = function(other) {
                            if (other.isZero()) { throw Error("division by zero") } else if (this.isZero()) { return goog.math.Long.ZERO }
                            if (this.equals(goog.math.Long.MIN_VALUE)) { if (other.equals(goog.math.Long.ONE) || other.equals(goog.math.Long.NEG_ONE)) { return goog.math.Long.MIN_VALUE } else if (other.equals(goog.math.Long.MIN_VALUE)) { return goog.math.Long.ONE } else { var halfThis = this.shiftRight(1); var approx = halfThis.div(other).shiftLeft(1); if (approx.equals(goog.math.Long.ZERO)) { return other.isNegative() ? goog.math.Long.ONE : goog.math.Long.NEG_ONE } else { var rem = this.subtract(other.multiply(approx)); var result = approx.add(rem.div(other)); return result } } } else if (other.equals(goog.math.Long.MIN_VALUE)) { return goog.math.Long.ZERO }
                            if (this.isNegative()) { if (other.isNegative()) { return this.negate().div(other.negate()) } else { return this.negate().div(other).negate() } } else if (other.isNegative()) { return this.div(other.negate()).negate() }
                            var res = goog.math.Long.ZERO;
                            var rem = this;
                            while (rem.greaterThanOrEqual(other)) {
                                var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));
                                var log2 = Math.ceil(Math.log(approx) / Math.LN2);
                                var delta = log2 <= 48 ? 1 : Math.pow(2, log2 - 48);
                                var approxRes = goog.math.Long.fromNumber(approx);
                                var approxRem = approxRes.multiply(other);
                                while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
                                    approx -= delta;
                                    approxRes = goog.math.Long.fromNumber(approx);
                                    approxRem = approxRes.multiply(other)
                                }
                                if (approxRes.isZero()) { approxRes = goog.math.Long.ONE }
                                res = res.add(approxRes);
                                rem = rem.subtract(approxRem)
                            }
                            return res
                        };
                        goog.math.Long.prototype.modulo = function(other) { return this.subtract(this.div(other).multiply(other)) };
                        goog.math.Long.prototype.not = function() { return goog.math.Long.fromBits(~this.low_, ~this.high_) };
                        goog.math.Long.prototype.and = function(other) { return goog.math.Long.fromBits(this.low_ & other.low_, this.high_ & other.high_) };
                        goog.math.Long.prototype.or = function(other) { return goog.math.Long.fromBits(this.low_ | other.low_, this.high_ | other.high_) };
                        goog.math.Long.prototype.xor = function(other) { return goog.math.Long.fromBits(this.low_ ^ other.low_, this.high_ ^ other.high_) };
                        goog.math.Long.prototype.shiftLeft = function(numBits) { numBits &= 63; if (numBits == 0) { return this } else { var low = this.low_; if (numBits < 32) { var high = this.high_; return goog.math.Long.fromBits(low << numBits, high << numBits | low >>> 32 - numBits) } else { return goog.math.Long.fromBits(0, low << numBits - 32) } } };
                        goog.math.Long.prototype.shiftRight = function(numBits) { numBits &= 63; if (numBits == 0) { return this } else { var high = this.high_; if (numBits < 32) { var low = this.low_; return goog.math.Long.fromBits(low >>> numBits | high << 32 - numBits, high >> numBits) } else { return goog.math.Long.fromBits(high >> numBits - 32, high >= 0 ? 0 : -1) } } };
                        goog.math.Long.prototype.shiftRightUnsigned = function(numBits) { numBits &= 63; if (numBits == 0) { return this } else { var high = this.high_; if (numBits < 32) { var low = this.low_; return goog.math.Long.fromBits(low >>> numBits | high << 32 - numBits, high >>> numBits) } else if (numBits == 32) { return goog.math.Long.fromBits(high, 0) } else { return goog.math.Long.fromBits(high >>> numBits - 32, 0) } } };
                        var navigator = { appName: "Modern Browser" };
                        var dbits;
                        var canary = 0xdeadbeefcafe;
                        var j_lm = (canary & 16777215) == 15715070;

                        function BigInteger(a, b, c) {
                            if (a != null)
                                if ("number" == typeof a) this.fromNumber(a, b, c);
                                else if (b == null && "string" != typeof a) this.fromString(a, 256);
                            else this.fromString(a, b)
                        }

                        function nbi() { return new BigInteger(null) }

                        function am1(i, x, w, j, c, n) {
                            while (--n >= 0) {
                                var v = x * this[i++] + w[j] + c;
                                c = Math.floor(v / 67108864);
                                w[j++] = v & 67108863
                            }
                            return c
                        }

                        function am2(i, x, w, j, c, n) {
                            var xl = x & 32767,
                                xh = x >> 15;
                            while (--n >= 0) {
                                var l = this[i] & 32767;
                                var h = this[i++] >> 15;
                                var m = xh * l + h * xl;
                                l = xl * l + ((m & 32767) << 15) + w[j] + (c & 1073741823);
                                c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
                                w[j++] = l & 1073741823
                            }
                            return c
                        }

                        function am3(i, x, w, j, c, n) {
                            var xl = x & 16383,
                                xh = x >> 14;
                            while (--n >= 0) {
                                var l = this[i] & 16383;
                                var h = this[i++] >> 14;
                                var m = xh * l + h * xl;
                                l = xl * l + ((m & 16383) << 14) + w[j] + c;
                                c = (l >> 28) + (m >> 14) + xh * h;
                                w[j++] = l & 268435455
                            }
                            return c
                        }
                        if (j_lm && navigator.appName == "Microsoft Internet Explorer") {
                            BigInteger.prototype.am = am2;
                            dbits = 30
                        } else if (j_lm && navigator.appName != "Netscape") {
                            BigInteger.prototype.am = am1;
                            dbits = 26
                        } else {
                            BigInteger.prototype.am = am3;
                            dbits = 28
                        }
                        BigInteger.prototype.DB = dbits;
                        BigInteger.prototype.DM = (1 << dbits) - 1;
                        BigInteger.prototype.DV = 1 << dbits;
                        var BI_FP = 52;
                        BigInteger.prototype.FV = Math.pow(2, BI_FP);
                        BigInteger.prototype.F1 = BI_FP - dbits;
                        BigInteger.prototype.F2 = 2 * dbits - BI_FP;
                        var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
                        var BI_RC = new Array;
                        var rr, vv;
                        rr = "0".charCodeAt(0);
                        for (vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
                        rr = "a".charCodeAt(0);
                        for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
                        rr = "A".charCodeAt(0);
                        for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

                        function int2char(n) { return BI_RM.charAt(n) }

                        function intAt(s, i) { var c = BI_RC[s.charCodeAt(i)]; return c == null ? -1 : c }

                        function bnpCopyTo(r) {
                            for (var i = this.t - 1; i >= 0; --i) r[i] = this[i];
                            r.t = this.t;
                            r.s = this.s
                        }

                        function bnpFromInt(x) {
                            this.t = 1;
                            this.s = x < 0 ? -1 : 0;
                            if (x > 0) this[0] = x;
                            else if (x < -1) this[0] = x + DV;
                            else this.t = 0
                        }

                        function nbv(i) {
                            var r = nbi();
                            r.fromInt(i);
                            return r
                        }

                        function bnpFromString(s, b) {
                            var k;
                            if (b == 16) k = 4;
                            else if (b == 8) k = 3;
                            else if (b == 256) k = 8;
                            else if (b == 2) k = 1;
                            else if (b == 32) k = 5;
                            else if (b == 4) k = 2;
                            else { this.fromRadix(s, b); return }
                            this.t = 0;
                            this.s = 0;
                            var i = s.length,
                                mi = false,
                                sh = 0;
                            while (--i >= 0) {
                                var x = k == 8 ? s[i] & 255 : intAt(s, i);
                                if (x < 0) { if (s.charAt(i) == "-") mi = true; continue }
                                mi = false;
                                if (sh == 0) this[this.t++] = x;
                                else if (sh + k > this.DB) {
                                    this[this.t - 1] |= (x & (1 << this.DB - sh) - 1) << sh;
                                    this[this.t++] = x >> this.DB - sh
                                } else this[this.t - 1] |= x << sh;
                                sh += k;
                                if (sh >= this.DB) sh -= this.DB
                            }
                            if (k == 8 && (s[0] & 128) != 0) { this.s = -1; if (sh > 0) this[this.t - 1] |= (1 << this.DB - sh) - 1 << sh }
                            this.clamp();
                            if (mi) BigInteger.ZERO.subTo(this, this)
                        }

                        function bnpClamp() { var c = this.s & this.DM; while (this.t > 0 && this[this.t - 1] == c) --this.t }

                        function bnToString(b) {
                            if (this.s < 0) return "-" + this.negate().toString(b);
                            var k;
                            if (b == 16) k = 4;
                            else if (b == 8) k = 3;
                            else if (b == 2) k = 1;
                            else if (b == 32) k = 5;
                            else if (b == 4) k = 2;
                            else return this.toRadix(b);
                            var km = (1 << k) - 1,
                                d, m = false,
                                r = "",
                                i = this.t;
                            var p = this.DB - i * this.DB % k;
                            if (i-- > 0) {
                                if (p < this.DB && (d = this[i] >> p) > 0) {
                                    m = true;
                                    r = int2char(d)
                                }
                                while (i >= 0) {
                                    if (p < k) {
                                        d = (this[i] & (1 << p) - 1) << k - p;
                                        d |= this[--i] >> (p += this.DB - k)
                                    } else { d = this[i] >> (p -= k) & km; if (p <= 0) { p += this.DB;--i } }
                                    if (d > 0) m = true;
                                    if (m) r += int2char(d)
                                }
                            }
                            return m ? r : "0"
                        }

                        function bnNegate() {
                            var r = nbi();
                            BigInteger.ZERO.subTo(this, r);
                            return r
                        }

                        function bnAbs() { return this.s < 0 ? this.negate() : this }

                        function bnCompareTo(a) {
                            var r = this.s - a.s;
                            if (r != 0) return r;
                            var i = this.t;
                            r = i - a.t;
                            if (r != 0) return this.s < 0 ? -r : r;
                            while (--i >= 0)
                                if ((r = this[i] - a[i]) != 0) return r;
                            return 0
                        }

                        function nbits(x) {
                            var r = 1,
                                t;
                            if ((t = x >>> 16) != 0) {
                                x = t;
                                r += 16
                            }
                            if ((t = x >> 8) != 0) {
                                x = t;
                                r += 8
                            }
                            if ((t = x >> 4) != 0) {
                                x = t;
                                r += 4
                            }
                            if ((t = x >> 2) != 0) {
                                x = t;
                                r += 2
                            }
                            if ((t = x >> 1) != 0) {
                                x = t;
                                r += 1
                            }
                            return r
                        }

                        function bnBitLength() { if (this.t <= 0) return 0; return this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ this.s & this.DM) }

                        function bnpDLShiftTo(n, r) {
                            var i;
                            for (i = this.t - 1; i >= 0; --i) r[i + n] = this[i];
                            for (i = n - 1; i >= 0; --i) r[i] = 0;
                            r.t = this.t + n;
                            r.s = this.s
                        }

                        function bnpDRShiftTo(n, r) {
                            for (var i = n; i < this.t; ++i) r[i - n] = this[i];
                            r.t = Math.max(this.t - n, 0);
                            r.s = this.s
                        }

                        function bnpLShiftTo(n, r) {
                            var bs = n % this.DB;
                            var cbs = this.DB - bs;
                            var bm = (1 << cbs) - 1;
                            var ds = Math.floor(n / this.DB),
                                c = this.s << bs & this.DM,
                                i;
                            for (i = this.t - 1; i >= 0; --i) {
                                r[i + ds + 1] = this[i] >> cbs | c;
                                c = (this[i] & bm) << bs
                            }
                            for (i = ds - 1; i >= 0; --i) r[i] = 0;
                            r[ds] = c;
                            r.t = this.t + ds + 1;
                            r.s = this.s;
                            r.clamp()
                        }

                        function bnpRShiftTo(n, r) {
                            r.s = this.s;
                            var ds = Math.floor(n / this.DB);
                            if (ds >= this.t) { r.t = 0; return }
                            var bs = n % this.DB;
                            var cbs = this.DB - bs;
                            var bm = (1 << bs) - 1;
                            r[0] = this[ds] >> bs;
                            for (var i = ds + 1; i < this.t; ++i) {
                                r[i - ds - 1] |= (this[i] & bm) << cbs;
                                r[i - ds] = this[i] >> bs
                            }
                            if (bs > 0) r[this.t - ds - 1] |= (this.s & bm) << cbs;
                            r.t = this.t - ds;
                            r.clamp()
                        }

                        function bnpSubTo(a, r) {
                            var i = 0,
                                c = 0,
                                m = Math.min(a.t, this.t);
                            while (i < m) {
                                c += this[i] - a[i];
                                r[i++] = c & this.DM;
                                c >>= this.DB
                            }
                            if (a.t < this.t) {
                                c -= a.s;
                                while (i < this.t) {
                                    c += this[i];
                                    r[i++] = c & this.DM;
                                    c >>= this.DB
                                }
                                c += this.s
                            } else {
                                c += this.s;
                                while (i < a.t) {
                                    c -= a[i];
                                    r[i++] = c & this.DM;
                                    c >>= this.DB
                                }
                                c -= a.s
                            }
                            r.s = c < 0 ? -1 : 0;
                            if (c < -1) r[i++] = this.DV + c;
                            else if (c > 0) r[i++] = c;
                            r.t = i;
                            r.clamp()
                        }

                        function bnpMultiplyTo(a, r) {
                            var x = this.abs(),
                                y = a.abs();
                            var i = x.t;
                            r.t = i + y.t;
                            while (--i >= 0) r[i] = 0;
                            for (i = 0; i < y.t; ++i) r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
                            r.s = 0;
                            r.clamp();
                            if (this.s != a.s) BigInteger.ZERO.subTo(r, r)
                        }

                        function bnpSquareTo(r) {
                            var x = this.abs();
                            var i = r.t = 2 * x.t;
                            while (--i >= 0) r[i] = 0;
                            for (i = 0; i < x.t - 1; ++i) {
                                var c = x.am(i, x[i], r, 2 * i, 0, 1);
                                if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= x.DV) {
                                    r[i + x.t] -= x.DV;
                                    r[i + x.t + 1] = 1
                                }
                            }
                            if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
                            r.s = 0;
                            r.clamp()
                        }

                        function bnpDivRemTo(m, q, r) {
                            var pm = m.abs();
                            if (pm.t <= 0) return;
                            var pt = this.abs();
                            if (pt.t < pm.t) { if (q != null) q.fromInt(0); if (r != null) this.copyTo(r); return }
                            if (r == null) r = nbi();
                            var y = nbi(),
                                ts = this.s,
                                ms = m.s;
                            var nsh = this.DB - nbits(pm[pm.t - 1]);
                            if (nsh > 0) {
                                pm.lShiftTo(nsh, y);
                                pt.lShiftTo(nsh, r)
                            } else {
                                pm.copyTo(y);
                                pt.copyTo(r)
                            }
                            var ys = y.t;
                            var y0 = y[ys - 1];
                            if (y0 == 0) return;
                            var yt = y0 * (1 << this.F1) + (ys > 1 ? y[ys - 2] >> this.F2 : 0);
                            var d1 = this.FV / yt,
                                d2 = (1 << this.F1) / yt,
                                e = 1 << this.F2;
                            var i = r.t,
                                j = i - ys,
                                t = q == null ? nbi() : q;
                            y.dlShiftTo(j, t);
                            if (r.compareTo(t) >= 0) {
                                r[r.t++] = 1;
                                r.subTo(t, r)
                            }
                            BigInteger.ONE.dlShiftTo(ys, t);
                            t.subTo(y, y);
                            while (y.t < ys) y[y.t++] = 0;
                            while (--j >= 0) {
                                var qd = r[--i] == y0 ? this.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
                                if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {
                                    y.dlShiftTo(j, t);
                                    r.subTo(t, r);
                                    while (r[i] < --qd) r.subTo(t, r)
                                }
                            }
                            if (q != null) { r.drShiftTo(ys, q); if (ts != ms) BigInteger.ZERO.subTo(q, q) }
                            r.t = ys;
                            r.clamp();
                            if (nsh > 0) r.rShiftTo(nsh, r);
                            if (ts < 0) BigInteger.ZERO.subTo(r, r)
                        }

                        function bnMod(a) {
                            var r = nbi();
                            this.abs().divRemTo(a, null, r);
                            if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
                            return r
                        }

                        function Classic(m) { this.m = m }

                        function cConvert(x) {
                            if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
                            else return x
                        }

                        function cRevert(x) { return x }

                        function cReduce(x) { x.divRemTo(this.m, null, x) }

                        function cMulTo(x, y, r) {
                            x.multiplyTo(y, r);
                            this.reduce(r)
                        }

                        function cSqrTo(x, r) {
                            x.squareTo(r);
                            this.reduce(r)
                        }
                        Classic.prototype.convert = cConvert;
                        Classic.prototype.revert = cRevert;
                        Classic.prototype.reduce = cReduce;
                        Classic.prototype.mulTo = cMulTo;
                        Classic.prototype.sqrTo = cSqrTo;

                        function bnpInvDigit() {
                            if (this.t < 1) return 0;
                            var x = this[0];
                            if ((x & 1) == 0) return 0;
                            var y = x & 3;
                            y = y * (2 - (x & 15) * y) & 15;
                            y = y * (2 - (x & 255) * y) & 255;
                            y = y * (2 - ((x & 65535) * y & 65535)) & 65535;
                            y = y * (2 - x * y % this.DV) % this.DV;
                            return y > 0 ? this.DV - y : -y
                        }

                        function Montgomery(m) {
                            this.m = m;
                            this.mp = m.invDigit();
                            this.mpl = this.mp & 32767;
                            this.mph = this.mp >> 15;
                            this.um = (1 << m.DB - 15) - 1;
                            this.mt2 = 2 * m.t
                        }

                        function montConvert(x) {
                            var r = nbi();
                            x.abs().dlShiftTo(this.m.t, r);
                            r.divRemTo(this.m, null, r);
                            if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
                            return r
                        }

                        function montRevert(x) {
                            var r = nbi();
                            x.copyTo(r);
                            this.reduce(r);
                            return r
                        }

                        function montReduce(x) {
                            while (x.t <= this.mt2) x[x.t++] = 0;
                            for (var i = 0; i < this.m.t; ++i) {
                                var j = x[i] & 32767;
                                var u0 = j * this.mpl + ((j * this.mph + (x[i] >> 15) * this.mpl & this.um) << 15) & x.DM;
                                j = i + this.m.t;
                                x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
                                while (x[j] >= x.DV) {
                                    x[j] -= x.DV;
                                    x[++j]++
                                }
                            }
                            x.clamp();
                            x.drShiftTo(this.m.t, x);
                            if (x.compareTo(this.m) >= 0) x.subTo(this.m, x)
                        }

                        function montSqrTo(x, r) {
                            x.squareTo(r);
                            this.reduce(r)
                        }

                        function montMulTo(x, y, r) {
                            x.multiplyTo(y, r);
                            this.reduce(r)
                        }
                        Montgomery.prototype.convert = montConvert;
                        Montgomery.prototype.revert = montRevert;
                        Montgomery.prototype.reduce = montReduce;
                        Montgomery.prototype.mulTo = montMulTo;
                        Montgomery.prototype.sqrTo = montSqrTo;

                        function bnpIsEven() { return (this.t > 0 ? this[0] & 1 : this.s) == 0 }

                        function bnpExp(e, z) {
                            if (e > 4294967295 || e < 1) return BigInteger.ONE;
                            var r = nbi(),
                                r2 = nbi(),
                                g = z.convert(this),
                                i = nbits(e) - 1;
                            g.copyTo(r);
                            while (--i >= 0) {
                                z.sqrTo(r, r2);
                                if ((e & 1 << i) > 0) z.mulTo(r2, g, r);
                                else {
                                    var t = r;
                                    r = r2;
                                    r2 = t
                                }
                            }
                            return z.revert(r)
                        }

                        function bnModPowInt(e, m) {
                            var z;
                            if (e < 256 || m.isEven()) z = new Classic(m);
                            else z = new Montgomery(m);
                            return this.exp(e, z)
                        }
                        BigInteger.prototype.copyTo = bnpCopyTo;
                        BigInteger.prototype.fromInt = bnpFromInt;
                        BigInteger.prototype.fromString = bnpFromString;
                        BigInteger.prototype.clamp = bnpClamp;
                        BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
                        BigInteger.prototype.drShiftTo = bnpDRShiftTo;
                        BigInteger.prototype.lShiftTo = bnpLShiftTo;
                        BigInteger.prototype.rShiftTo = bnpRShiftTo;
                        BigInteger.prototype.subTo = bnpSubTo;
                        BigInteger.prototype.multiplyTo = bnpMultiplyTo;
                        BigInteger.prototype.squareTo = bnpSquareTo;
                        BigInteger.prototype.divRemTo = bnpDivRemTo;
                        BigInteger.prototype.invDigit = bnpInvDigit;
                        BigInteger.prototype.isEven = bnpIsEven;
                        BigInteger.prototype.exp = bnpExp;
                        BigInteger.prototype.toString = bnToString;
                        BigInteger.prototype.negate = bnNegate;
                        BigInteger.prototype.abs = bnAbs;
                        BigInteger.prototype.compareTo = bnCompareTo;
                        BigInteger.prototype.bitLength = bnBitLength;
                        BigInteger.prototype.mod = bnMod;
                        BigInteger.prototype.modPowInt = bnModPowInt;
                        BigInteger.ZERO = nbv(0);
                        BigInteger.ONE = nbv(1);

                        function bnpFromRadix(s, b) {
                            this.fromInt(0);
                            if (b == null) b = 10;
                            var cs = this.chunkSize(b);
                            var d = Math.pow(b, cs),
                                mi = false,
                                j = 0,
                                w = 0;
                            for (var i = 0; i < s.length; ++i) {
                                var x = intAt(s, i);
                                if (x < 0) { if (s.charAt(i) == "-" && this.signum() == 0) mi = true; continue }
                                w = b * w + x;
                                if (++j >= cs) {
                                    this.dMultiply(d);
                                    this.dAddOffset(w, 0);
                                    j = 0;
                                    w = 0
                                }
                            }
                            if (j > 0) {
                                this.dMultiply(Math.pow(b, j));
                                this.dAddOffset(w, 0)
                            }
                            if (mi) BigInteger.ZERO.subTo(this, this)
                        }

                        function bnpChunkSize(r) { return Math.floor(Math.LN2 * this.DB / Math.log(r)) }

                        function bnSigNum() {
                            if (this.s < 0) return -1;
                            else if (this.t <= 0 || this.t == 1 && this[0] <= 0) return 0;
                            else return 1
                        }

                        function bnpDMultiply(n) {
                            this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
                            ++this.t;
                            this.clamp()
                        }

                        function bnpDAddOffset(n, w) {
                            if (n == 0) return;
                            while (this.t <= w) this[this.t++] = 0;
                            this[w] += n;
                            while (this[w] >= this.DV) { this[w] -= this.DV; if (++w >= this.t) this[this.t++] = 0;++this[w] }
                        }

                        function bnpToRadix(b) {
                            if (b == null) b = 10;
                            if (this.signum() == 0 || b < 2 || b > 36) return "0";
                            var cs = this.chunkSize(b);
                            var a = Math.pow(b, cs);
                            var d = nbv(a),
                                y = nbi(),
                                z = nbi(),
                                r = "";
                            this.divRemTo(d, y, z);
                            while (y.signum() > 0) {
                                r = (a + z.intValue()).toString(b).substr(1) + r;
                                y.divRemTo(d, y, z)
                            }
                            return z.intValue().toString(b) + r
                        }

                        function bnIntValue() {
                            if (this.s < 0) {
                                if (this.t == 1) return this[0] - this.DV;
                                else if (this.t == 0) return -1
                            } else if (this.t == 1) return this[0];
                            else if (this.t == 0) return 0;
                            return (this[1] & (1 << 32 - this.DB) - 1) << this.DB | this[0]
                        }

                        function bnpAddTo(a, r) {
                            var i = 0,
                                c = 0,
                                m = Math.min(a.t, this.t);
                            while (i < m) {
                                c += this[i] + a[i];
                                r[i++] = c & this.DM;
                                c >>= this.DB
                            }
                            if (a.t < this.t) {
                                c += a.s;
                                while (i < this.t) {
                                    c += this[i];
                                    r[i++] = c & this.DM;
                                    c >>= this.DB
                                }
                                c += this.s
                            } else {
                                c += this.s;
                                while (i < a.t) {
                                    c += a[i];
                                    r[i++] = c & this.DM;
                                    c >>= this.DB
                                }
                                c += a.s
                            }
                            r.s = c < 0 ? -1 : 0;
                            if (c > 0) r[i++] = c;
                            else if (c < -1) r[i++] = this.DV + c;
                            r.t = i;
                            r.clamp()
                        }
                        BigInteger.prototype.fromRadix = bnpFromRadix;
                        BigInteger.prototype.chunkSize = bnpChunkSize;
                        BigInteger.prototype.signum = bnSigNum;
                        BigInteger.prototype.dMultiply = bnpDMultiply;
                        BigInteger.prototype.dAddOffset = bnpDAddOffset;
                        BigInteger.prototype.toRadix = bnpToRadix;
                        BigInteger.prototype.intValue = bnIntValue;
                        BigInteger.prototype.addTo = bnpAddTo;
                        var Wrapper = {
                            abs: function(l, h) {
                                var x = new goog.math.Long(l, h);
                                var ret;
                                if (x.isNegative()) { ret = x.negate() } else { ret = x }
                                HEAP32[tempDoublePtr >> 2] = ret.low_;
                                HEAP32[tempDoublePtr + 4 >> 2] = ret.high_
                            },
                            ensureTemps: function() {
                                if (Wrapper.ensuredTemps) return;
                                Wrapper.ensuredTemps = true;
                                Wrapper.two32 = new BigInteger;
                                Wrapper.two32.fromString("4294967296", 10);
                                Wrapper.two64 = new BigInteger;
                                Wrapper.two64.fromString("18446744073709551616", 10);
                                Wrapper.temp1 = new BigInteger;
                                Wrapper.temp2 = new BigInteger
                            },
                            lh2bignum: function(l, h) {
                                var a = new BigInteger;
                                a.fromString(h.toString(), 10);
                                var b = new BigInteger;
                                a.multiplyTo(Wrapper.two32, b);
                                var c = new BigInteger;
                                c.fromString(l.toString(), 10);
                                var d = new BigInteger;
                                c.addTo(b, d);
                                return d
                            },
                            stringify: function(l, h, unsigned) {
                                var ret = new goog.math.Long(l, h).toString();
                                if (unsigned && ret[0] == "-") {
                                    Wrapper.ensureTemps();
                                    var bignum = new BigInteger;
                                    bignum.fromString(ret, 10);
                                    ret = new BigInteger;
                                    Wrapper.two64.addTo(bignum, ret);
                                    ret = ret.toString(10)
                                }
                                return ret
                            },
                            fromString: function(str, base, min, max, unsigned) {
                                Wrapper.ensureTemps();
                                var bignum = new BigInteger;
                                bignum.fromString(str, base);
                                var bigmin = new BigInteger;
                                bigmin.fromString(min, 10);
                                var bigmax = new BigInteger;
                                bigmax.fromString(max, 10);
                                if (unsigned && bignum.compareTo(BigInteger.ZERO) < 0) {
                                    var temp = new BigInteger;
                                    bignum.addTo(Wrapper.two64, temp);
                                    bignum = temp
                                }
                                var error = false;
                                if (bignum.compareTo(bigmin) < 0) {
                                    bignum = bigmin;
                                    error = true
                                } else if (bignum.compareTo(bigmax) > 0) {
                                    bignum = bigmax;
                                    error = true
                                }
                                var ret = goog.math.Long.fromString(bignum.toString());
                                HEAP32[tempDoublePtr >> 2] = ret.low_;
                                HEAP32[tempDoublePtr + 4 >> 2] = ret.high_;
                                if (error) throw "range error"
                            }
                        };
                        return Wrapper
                    }();
                    if (memoryInitializer) {
                        if (typeof Module["locateFile"] === "function") { memoryInitializer = Module["locateFile"](memoryInitializer) } else if (Module["memoryInitializerPrefixURL"]) { memoryInitializer = Module["memoryInitializerPrefixURL"] + memoryInitializer }
                        if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
                            var data = Module["readBinary"](memoryInitializer);
                            HEAPU8.set(data, STATIC_BASE)
                        } else {
                            addRunDependency("memory initializer");
                            Browser.asyncLoad(memoryInitializer, function(data) {
                                HEAPU8.set(data, STATIC_BASE);
                                removeRunDependency("memory initializer")
                            }, function(data) { throw "could not load memory initializer " + memoryInitializer })
                        }
                    }

                    function ExitStatus(status) {
                        this.name = "ExitStatus";
                        this.message = "Program terminated with exit(" + status + ")";
                        this.status = status
                    }
                    ExitStatus.prototype = new Error;
                    ExitStatus.prototype.constructor = ExitStatus;
                    var initialStackTop;
                    var preloadStartTime = null;
                    var calledMain = false;
                    dependenciesFulfilled = function runCaller() { if (!Module["calledRun"] && shouldRunNow) run(); if (!Module["calledRun"]) dependenciesFulfilled = runCaller };
                    Module["callMain"] = Module.callMain = function callMain(args) {
                        assert(runDependencies == 0, "cannot call main when async dependencies remain! (listen on __ATMAIN__)");
                        assert(__ATPRERUN__.length == 0, "cannot call main when preRun functions remain to be called");
                        args = args || [];
                        ensureInitRuntime();
                        var argc = args.length + 1;

                        function pad() { for (var i = 0; i < 4 - 1; i++) { argv.push(0) } }
                        var argv = [allocate(intArrayFromString(Module["thisProgram"]), "i8", ALLOC_NORMAL)];
                        pad();
                        for (var i = 0; i < argc - 1; i = i + 1) {
                            argv.push(allocate(intArrayFromString(args[i]), "i8", ALLOC_NORMAL));
                            pad()
                        }
                        argv.push(0);
                        argv = allocate(argv, "i32", ALLOC_NORMAL);
                        initialStackTop = STACKTOP;
                        try {
                            var ret = Module["_main"](argc, argv, 0);
                            exit(ret)
                        } catch (e) { if (e instanceof ExitStatus) { return } else if (e == "SimulateInfiniteLoop") { Module["noExitRuntime"] = true; return } else { if (e && typeof e === "object" && e.stack) Module.printErr("exception thrown: " + [e, e.stack]); throw e } } finally { calledMain = true }
                    };

                    function run(args) {
                        args = args || Module["arguments"];
                        if (preloadStartTime === null) preloadStartTime = Date.now();
                        if (runDependencies > 0) { return }
                        preRun();
                        if (runDependencies > 0) return;
                        if (Module["calledRun"]) return;

                        function doRun() {
                            if (Module["calledRun"]) return;
                            Module["calledRun"] = true;
                            if (ABORT) return;
                            ensureInitRuntime();
                            preMain();
                            if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) { Module.printErr("pre-main prep time: " + (Date.now() - preloadStartTime) + " ms") }
                            if (Module["_main"] && shouldRunNow) { Module["callMain"](args) }
                            postRun()
                        }
                        if (Module["setStatus"]) {
                            Module["setStatus"]("Running...");
                            setTimeout(function() {
                                setTimeout(function() { Module["setStatus"]("") }, 1);
                                doRun()
                            }, 1)
                        } else { doRun() }
                    }
                    Module["run"] = Module.run = run;

                    function exit(status) {
                        if (Module["noExitRuntime"]) { return }
                        ABORT = true;
                        EXITSTATUS = status;
                        STACKTOP = initialStackTop;
                        exitRuntime();
                        if (ENVIRONMENT_IS_NODE) {
                            process["stdout"]["once"]("drain", function() { process["exit"](status) });
                            console.log(" ");
                            setTimeout(function() { process["exit"](status) }, 500)
                        } else if (ENVIRONMENT_IS_SHELL && typeof quit === "function") { quit(status) }
                        throw new ExitStatus(status)
                    }
                    Module["exit"] = Module.exit = exit;

                    function abort(text) {
                        if (text) {
                            Module.print(text);
                            Module.printErr(text)
                        }
                        ABORT = true;
                        EXITSTATUS = 1;
                        var extra = "\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.";
                        throw "abort() at " + stackTrace() + extra
                    }
                    Module["abort"] = Module.abort = abort;
                    if (Module["preInit"]) { if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]]; while (Module["preInit"].length > 0) { Module["preInit"].pop()() } }
                    var shouldRunNow = true;
                    if (Module["noInitialRun"]) { shouldRunNow = false }
                    run();
                    var origMalloc = Module._malloc;
                    var origFree = Module._free;
                    var MEMSTATS = { totalMemory: Module.HEAPU8.length, heapUsed: 0 };
                    var MEMSTATS_DATA = { pointerToSizeMap: {}, getSizeOfPointer: function(ptr) { return MEMSTATS_DATA.pointerToSizeMap[ptr] } };
                    Module.MEMSTATS = MEMSTATS;
                    Module.MEMSTATS_DATA = MEMSTATS_DATA;
                    var hookedMalloc = function(size) {
                        var ptr = origMalloc(size);
                        if (!ptr) { return 0 }
                        MEMSTATS.heapUsed += size;
                        MEMSTATS_DATA.pointerToSizeMap[ptr] = size;
                        return ptr
                    };
                    var hookedFree = function(ptr) {
                        if (ptr) {
                            MEMSTATS.heapUsed -= MEMSTATS_DATA.getSizeOfPointer(ptr) || 0;
                            delete MEMSTATS_DATA.pointerToSizeMap[ptr]
                        }
                        return origFree(ptr)
                    };
                    Module._malloc = hookedMalloc;
                    Module._free = hookedFree;
                    _malloc = hookedMalloc;
                    _free = hookedFree;
                    var setInnerMalloc, setInnerFree;
                    if (setInnerMalloc) {
                        setInnerMalloc(hookedMalloc);
                        setInnerFree(hookedFree)
                    }
                    return module.exports
                };
                if (typeof module !== "undefined") { module.exports = C_MINISAT }
            }).call(this, "/node_modules/logic-solver")
        }, { fs: 5, path: 6 }],
        3: [function(require, module, exports) {
            var C_MINISAT = require("./minisat.js");
            var _ = require("underscore");
            var MiniSat;
            MiniSat = function() {
                var C = this._C = C_MINISAT();
                this._native = { getStackPointer: function() { return C.Runtime.stackSave() }, setStackPointer: function(ptr) { C.Runtime.stackRestore(ptr) }, allocateBytes: function(len) { return C.allocate(len, "i8", C.ALLOC_STACK) }, pushString: function(str) { return this.allocateBytes(C.intArrayFromString(str)) }, savingStack: function(func) { var SP = this.getStackPointer(); try { return func(this, C) } finally { this.setStackPointer(SP) } } };
                C._createTheSolver();
                this._clauses = []
            };
            MiniSat.prototype.ensureVar = function(v) { this._C._ensureVar(v) };
            MiniSat.prototype.addClause = function(terms) {
                this._clauses.push(terms);
                return this._native.savingStack(function(native, C) {
                    var termsPtr = C.allocate((terms.length + 1) * 4, "i32", C.ALLOC_STACK);
                    _.each(terms, function(t, i) { C.setValue(termsPtr + i * 4, t, "i32") });
                    C.setValue(termsPtr + terms.length * 4, 0, "i32");
                    return C._addClause(termsPtr) ? true : false
                })
            };
            MiniSat.prototype.solve = function() { return this._C._solve() ? true : false };
            MiniSat.prototype.solveAssuming = function(v) { return this._C._solveAssuming(v) ? true : false };
            MiniSat.prototype.getSolution = function() { var solution = [null]; var C = this._C; var numVars = C._getNumVars(); var solPtr = C._getSolution(); for (var i = 0; i < numVars; i++) { solution[i + 1] = C.getValue(solPtr + i, "i8") === 0 } return solution };
            MiniSat.prototype.retireVar = function(v) { this._C._retireVar(v) };
            MiniSat.prototype.getConflictClause = function() {
                var C = this._C;
                var numTerms = C._getConflictClauseSize();
                var clausePtr = C._getConflictClause();
                var terms = [];
                for (var i = 0; i < numTerms; i++) {
                    var t = C.getValue(clausePtr + i * 4, "i32");
                    var v = t >>> 1;
                    var s = t & 1 ? -1 : 1;
                    terms[i] = v * s
                }
                return terms
            };
            module.exports = MiniSat
        }, { "./minisat.js": 2, underscore: 4 }],
        4: [function(require, module, exports) {
            (function() {
                var root = this;
                var previousUnderscore = root._;
                var ArrayProto = Array.prototype,
                    ObjProto = Object.prototype,
                    FuncProto = Function.prototype;
                var push = ArrayProto.push,
                    slice = ArrayProto.slice,
                    toString = ObjProto.toString,
                    hasOwnProperty = ObjProto.hasOwnProperty;
                var nativeIsArray = Array.isArray,
                    nativeKeys = Object.keys,
                    nativeBind = FuncProto.bind,
                    nativeCreate = Object.create;
                var Ctor = function() {};
                var _ = function(obj) {
                    if (obj instanceof _) return obj;
                    if (!(this instanceof _)) return new _(obj);
                    this._wrapped = obj
                };
                if (typeof exports !== "undefined") {
                    if (typeof module !== "undefined" && module.exports) { exports = module.exports = _ }
                    exports._ = _
                } else { root._ = _ }
                _.VERSION = "1.8.3";
                var optimizeCb = function(func, context, argCount) {
                    if (context === void 0) return func;
                    switch (argCount == null ? 3 : argCount) {
                        case 1:
                            return function(value) { return func.call(context, value) };
                        case 2:
                            return function(value, other) { return func.call(context, value, other) };
                        case 3:
                            return function(value, index, collection) { return func.call(context, value, index, collection) };
                        case 4:
                            return function(accumulator, value, index, collection) { return func.call(context, accumulator, value, index, collection) }
                    }
                    return function() { return func.apply(context, arguments) }
                };
                var cb = function(value, context, argCount) { if (value == null) return _.identity; if (_.isFunction(value)) return optimizeCb(value, context, argCount); if (_.isObject(value)) return _.matcher(value); return _.property(value) };
                _.iteratee = function(value, context) { return cb(value, context, Infinity) };
                var createAssigner = function(keysFunc, undefinedOnly) {
                    return function(obj) {
                        var length = arguments.length;
                        if (length < 2 || obj == null) return obj;
                        for (var index = 1; index < length; index++) {
                            var source = arguments[index],
                                keys = keysFunc(source),
                                l = keys.length;
                            for (var i = 0; i < l; i++) { var key = keys[i]; if (!undefinedOnly || obj[key] === void 0) obj[key] = source[key] }
                        }
                        return obj
                    }
                };
                var baseCreate = function(prototype) {
                    if (!_.isObject(prototype)) return {};
                    if (nativeCreate) return nativeCreate(prototype);
                    Ctor.prototype = prototype;
                    var result = new Ctor;
                    Ctor.prototype = null;
                    return result
                };
                var property = function(key) { return function(obj) { return obj == null ? void 0 : obj[key] } };
                var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
                var getLength = property("length");
                var isArrayLike = function(collection) { var length = getLength(collection); return typeof length == "number" && length >= 0 && length <= MAX_ARRAY_INDEX };
                _.each = _.forEach = function(obj, iteratee, context) { iteratee = optimizeCb(iteratee, context); var i, length; if (isArrayLike(obj)) { for (i = 0, length = obj.length; i < length; i++) { iteratee(obj[i], i, obj) } } else { var keys = _.keys(obj); for (i = 0, length = keys.length; i < length; i++) { iteratee(obj[keys[i]], keys[i], obj) } } return obj };
                _.map = _.collect = function(obj, iteratee, context) {
                    iteratee = cb(iteratee, context);
                    var keys = !isArrayLike(obj) && _.keys(obj),
                        length = (keys || obj).length,
                        results = Array(length);
                    for (var index = 0; index < length; index++) {
                        var currentKey = keys ? keys[index] : index;
                        results[index] = iteratee(obj[currentKey], currentKey, obj)
                    }
                    return results
                };

                function createReduce(dir) {
                    function iterator(obj, iteratee, memo, keys, index, length) {
                        for (; index >= 0 && index < length; index += dir) {
                            var currentKey = keys ? keys[index] : index;
                            memo = iteratee(memo, obj[currentKey], currentKey, obj)
                        }
                        return memo
                    }
                    return function(obj, iteratee, memo, context) {
                        iteratee = optimizeCb(iteratee, context, 4);
                        var keys = !isArrayLike(obj) && _.keys(obj),
                            length = (keys || obj).length,
                            index = dir > 0 ? 0 : length - 1;
                        if (arguments.length < 3) {
                            memo = obj[keys ? keys[index] : index];
                            index += dir
                        }
                        return iterator(obj, iteratee, memo, keys, index, length)
                    }
                }
                _.reduce = _.foldl = _.inject = createReduce(1);
                _.reduceRight = _.foldr = createReduce(-1);
                _.find = _.detect = function(obj, predicate, context) { var key; if (isArrayLike(obj)) { key = _.findIndex(obj, predicate, context) } else { key = _.findKey(obj, predicate, context) } if (key !== void 0 && key !== -1) return obj[key] };
                _.filter = _.select = function(obj, predicate, context) {
                    var results = [];
                    predicate = cb(predicate, context);
                    _.each(obj, function(value, index, list) { if (predicate(value, index, list)) results.push(value) });
                    return results
                };
                _.reject = function(obj, predicate, context) { return _.filter(obj, _.negate(cb(predicate)), context) };
                _.every = _.all = function(obj, predicate, context) {
                    predicate = cb(predicate, context);
                    var keys = !isArrayLike(obj) && _.keys(obj),
                        length = (keys || obj).length;
                    for (var index = 0; index < length; index++) { var currentKey = keys ? keys[index] : index; if (!predicate(obj[currentKey], currentKey, obj)) return false }
                    return true
                };
                _.some = _.any = function(obj, predicate, context) {
                    predicate = cb(predicate, context);
                    var keys = !isArrayLike(obj) && _.keys(obj),
                        length = (keys || obj).length;
                    for (var index = 0; index < length; index++) { var currentKey = keys ? keys[index] : index; if (predicate(obj[currentKey], currentKey, obj)) return true }
                    return false
                };
                _.contains = _.includes = _.include = function(obj, item, fromIndex, guard) { if (!isArrayLike(obj)) obj = _.values(obj); if (typeof fromIndex != "number" || guard) fromIndex = 0; return _.indexOf(obj, item, fromIndex) >= 0 };
                _.invoke = function(obj, method) { var args = slice.call(arguments, 2); var isFunc = _.isFunction(method); return _.map(obj, function(value) { var func = isFunc ? method : value[method]; return func == null ? func : func.apply(value, args) }) };
                _.pluck = function(obj, key) { return _.map(obj, _.property(key)) };
                _.where = function(obj, attrs) { return _.filter(obj, _.matcher(attrs)) };
                _.findWhere = function(obj, attrs) { return _.find(obj, _.matcher(attrs)) };
                _.max = function(obj, iteratee, context) {
                    var result = -Infinity,
                        lastComputed = -Infinity,
                        value, computed;
                    if (iteratee == null && obj != null) { obj = isArrayLike(obj) ? obj : _.values(obj); for (var i = 0, length = obj.length; i < length; i++) { value = obj[i]; if (value > result) { result = value } } } else {
                        iteratee = cb(iteratee, context);
                        _.each(obj, function(value, index, list) {
                            computed = iteratee(value, index, list);
                            if (computed > lastComputed || computed === -Infinity && result === -Infinity) {
                                result = value;
                                lastComputed = computed
                            }
                        })
                    }
                    return result
                };
                _.min = function(obj, iteratee, context) {
                    var result = Infinity,
                        lastComputed = Infinity,
                        value, computed;
                    if (iteratee == null && obj != null) { obj = isArrayLike(obj) ? obj : _.values(obj); for (var i = 0, length = obj.length; i < length; i++) { value = obj[i]; if (value < result) { result = value } } } else {
                        iteratee = cb(iteratee, context);
                        _.each(obj, function(value, index, list) {
                            computed = iteratee(value, index, list);
                            if (computed < lastComputed || computed === Infinity && result === Infinity) {
                                result = value;
                                lastComputed = computed
                            }
                        })
                    }
                    return result
                };
                _.shuffle = function(obj) {
                    var set = isArrayLike(obj) ? obj : _.values(obj);
                    var length = set.length;
                    var shuffled = Array(length);
                    for (var index = 0, rand; index < length; index++) {
                        rand = _.random(0, index);
                        if (rand !== index) shuffled[index] = shuffled[rand];
                        shuffled[rand] = set[index]
                    }
                    return shuffled
                };
                _.sample = function(obj, n, guard) { if (n == null || guard) { if (!isArrayLike(obj)) obj = _.values(obj); return obj[_.random(obj.length - 1)] } return _.shuffle(obj).slice(0, Math.max(0, n)) };
                _.sortBy = function(obj, iteratee, context) { iteratee = cb(iteratee, context); return _.pluck(_.map(obj, function(value, index, list) { return { value: value, index: index, criteria: iteratee(value, index, list) } }).sort(function(left, right) { var a = left.criteria; var b = right.criteria; if (a !== b) { if (a > b || a === void 0) return 1; if (a < b || b === void 0) return -1 } return left.index - right.index }), "value") };
                var group = function(behavior) {
                    return function(obj, iteratee, context) {
                        var result = {};
                        iteratee = cb(iteratee, context);
                        _.each(obj, function(value, index) {
                            var key = iteratee(value, index, obj);
                            behavior(result, value, key)
                        });
                        return result
                    }
                };
                _.groupBy = group(function(result, value, key) {
                    if (_.has(result, key)) result[key].push(value);
                    else result[key] = [value]
                });
                _.indexBy = group(function(result, value, key) { result[key] = value });
                _.countBy = group(function(result, value, key) {
                    if (_.has(result, key)) result[key]++;
                    else result[key] = 1
                });
                _.toArray = function(obj) { if (!obj) return []; if (_.isArray(obj)) return slice.call(obj); if (isArrayLike(obj)) return _.map(obj, _.identity); return _.values(obj) };
                _.size = function(obj) { if (obj == null) return 0; return isArrayLike(obj) ? obj.length : _.keys(obj).length };
                _.partition = function(obj, predicate, context) {
                    predicate = cb(predicate, context);
                    var pass = [],
                        fail = [];
                    _.each(obj, function(value, key, obj) {
                        (predicate(value, key, obj) ? pass : fail).push(value)
                    });
                    return [pass, fail]
                };
                _.first = _.head = _.take = function(array, n, guard) { if (array == null) return void 0; if (n == null || guard) return array[0]; return _.initial(array, array.length - n) };
                _.initial = function(array, n, guard) { return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n))) };
                _.last = function(array, n, guard) { if (array == null) return void 0; if (n == null || guard) return array[array.length - 1]; return _.rest(array, Math.max(0, array.length - n)) };
                _.rest = _.tail = _.drop = function(array, n, guard) { return slice.call(array, n == null || guard ? 1 : n) };
                _.compact = function(array) { return _.filter(array, _.identity) };
                var flatten = function(input, shallow, strict, startIndex) {
                    var output = [],
                        idx = 0;
                    for (var i = startIndex || 0, length = getLength(input); i < length; i++) {
                        var value = input[i];
                        if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
                            if (!shallow) value = flatten(value, shallow, strict);
                            var j = 0,
                                len = value.length;
                            output.length += len;
                            while (j < len) { output[idx++] = value[j++] }
                        } else if (!strict) { output[idx++] = value }
                    }
                    return output
                };
                _.flatten = function(array, shallow) { return flatten(array, shallow, false) };
                _.without = function(array) { return _.difference(array, slice.call(arguments, 1)) };
                _.uniq = _.unique = function(array, isSorted, iteratee, context) {
                    if (!_.isBoolean(isSorted)) {
                        context = iteratee;
                        iteratee = isSorted;
                        isSorted = false
                    }
                    if (iteratee != null) iteratee = cb(iteratee, context);
                    var result = [];
                    var seen = [];
                    for (var i = 0, length = getLength(array); i < length; i++) {
                        var value = array[i],
                            computed = iteratee ? iteratee(value, i, array) : value;
                        if (isSorted) {
                            if (!i || seen !== computed) result.push(value);
                            seen = computed
                        } else if (iteratee) {
                            if (!_.contains(seen, computed)) {
                                seen.push(computed);
                                result.push(value)
                            }
                        } else if (!_.contains(result, value)) { result.push(value) }
                    }
                    return result
                };
                _.union = function() { return _.uniq(flatten(arguments, true, true)) };
                _.intersection = function(array) { var result = []; var argsLength = arguments.length; for (var i = 0, length = getLength(array); i < length; i++) { var item = array[i]; if (_.contains(result, item)) continue; for (var j = 1; j < argsLength; j++) { if (!_.contains(arguments[j], item)) break } if (j === argsLength) result.push(item) } return result };
                _.difference = function(array) { var rest = flatten(arguments, true, true, 1); return _.filter(array, function(value) { return !_.contains(rest, value) }) };
                _.zip = function() { return _.unzip(arguments) };
                _.unzip = function(array) { var length = array && _.max(array, getLength).length || 0; var result = Array(length); for (var index = 0; index < length; index++) { result[index] = _.pluck(array, index) } return result };
                _.object = function(list, values) { var result = {}; for (var i = 0, length = getLength(list); i < length; i++) { if (values) { result[list[i]] = values[i] } else { result[list[i][0]] = list[i][1] } } return result };

                function createPredicateIndexFinder(dir) { return function(array, predicate, context) { predicate = cb(predicate, context); var length = getLength(array); var index = dir > 0 ? 0 : length - 1; for (; index >= 0 && index < length; index += dir) { if (predicate(array[index], index, array)) return index } return -1 } }
                _.findIndex = createPredicateIndexFinder(1);
                _.findLastIndex = createPredicateIndexFinder(-1);
                _.sortedIndex = function(array, obj, iteratee, context) {
                    iteratee = cb(iteratee, context, 1);
                    var value = iteratee(obj);
                    var low = 0,
                        high = getLength(array);
                    while (low < high) {
                        var mid = Math.floor((low + high) / 2);
                        if (iteratee(array[mid]) < value) low = mid + 1;
                        else high = mid
                    }
                    return low
                };

                function createIndexFinder(dir, predicateFind, sortedIndex) {
                    return function(array, item, idx) {
                        var i = 0,
                            length = getLength(array);
                        if (typeof idx == "number") { if (dir > 0) { i = idx >= 0 ? idx : Math.max(idx + length, i) } else { length = idx >= 0 ? Math.min(idx + 1, length) : idx + length + 1 } } else if (sortedIndex && idx && length) { idx = sortedIndex(array, item); return array[idx] === item ? idx : -1 }
                        if (item !== item) { idx = predicateFind(slice.call(array, i, length), _.isNaN); return idx >= 0 ? idx + i : -1 }
                        for (idx = dir > 0 ? i : length - 1; idx >= 0 && idx < length; idx += dir) { if (array[idx] === item) return idx }
                        return -1
                    }
                }
                _.indexOf = createIndexFinder(1, _.findIndex, _.sortedIndex);
                _.lastIndexOf = createIndexFinder(-1, _.findLastIndex);
                _.range = function(start, stop, step) {
                    if (stop == null) {
                        stop = start || 0;
                        start = 0
                    }
                    step = step || 1;
                    var length = Math.max(Math.ceil((stop - start) / step), 0);
                    var range = Array(length);
                    for (var idx = 0; idx < length; idx++, start += step) { range[idx] = start }
                    return range
                };
                var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) { if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args); var self = baseCreate(sourceFunc.prototype); var result = sourceFunc.apply(self, args); if (_.isObject(result)) return result; return self };
                _.bind = function(func, context) { if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1)); if (!_.isFunction(func)) throw new TypeError("Bind must be called on a function"); var args = slice.call(arguments, 2); var bound = function() { return executeBound(func, bound, context, this, args.concat(slice.call(arguments))) }; return bound };
                _.partial = function(func) {
                    var boundArgs = slice.call(arguments, 1);
                    var bound = function() {
                        var position = 0,
                            length = boundArgs.length;
                        var args = Array(length);
                        for (var i = 0; i < length; i++) { args[i] = boundArgs[i] === _ ? arguments[position++] : boundArgs[i] }
                        while (position < arguments.length) args.push(arguments[position++]);
                        return executeBound(func, bound, this, this, args)
                    };
                    return bound
                };
                _.bindAll = function(obj) {
                    var i, length = arguments.length,
                        key;
                    if (length <= 1) throw new Error("bindAll must be passed function names");
                    for (i = 1; i < length; i++) {
                        key = arguments[i];
                        obj[key] = _.bind(obj[key], obj)
                    }
                    return obj
                };
                _.memoize = function(func, hasher) {
                    var memoize = function(key) { var cache = memoize.cache; var address = "" + (hasher ? hasher.apply(this, arguments) : key); if (!_.has(cache, address)) cache[address] = func.apply(this, arguments); return cache[address] };
                    memoize.cache = {};
                    return memoize
                };
                _.delay = function(func, wait) { var args = slice.call(arguments, 2); return setTimeout(function() { return func.apply(null, args) }, wait) };
                _.defer = _.partial(_.delay, _, 1);
                _.throttle = function(func, wait, options) {
                    var context, args, result;
                    var timeout = null;
                    var previous = 0;
                    if (!options) options = {};
                    var later = function() {
                        previous = options.leading === false ? 0 : _.now();
                        timeout = null;
                        result = func.apply(context, args);
                        if (!timeout) context = args = null
                    };
                    return function() {
                        var now = _.now();
                        if (!previous && options.leading === false) previous = now;
                        var remaining = wait - (now - previous);
                        context = this;
                        args = arguments;
                        if (remaining <= 0 || remaining > wait) {
                            if (timeout) {
                                clearTimeout(timeout);
                                timeout = null
                            }
                            previous = now;
                            result = func.apply(context, args);
                            if (!timeout) context = args = null
                        } else if (!timeout && options.trailing !== false) { timeout = setTimeout(later, remaining) }
                        return result
                    }
                };
                _.debounce = function(func, wait, immediate) {
                    var timeout, args, context, timestamp, result;
                    var later = function() { var last = _.now() - timestamp; if (last < wait && last >= 0) { timeout = setTimeout(later, wait - last) } else { timeout = null; if (!immediate) { result = func.apply(context, args); if (!timeout) context = args = null } } };
                    return function() {
                        context = this;
                        args = arguments;
                        timestamp = _.now();
                        var callNow = immediate && !timeout;
                        if (!timeout) timeout = setTimeout(later, wait);
                        if (callNow) {
                            result = func.apply(context, args);
                            context = args = null
                        }
                        return result
                    }
                };
                _.wrap = function(func, wrapper) { return _.partial(wrapper, func) };
                _.negate = function(predicate) { return function() { return !predicate.apply(this, arguments) } };
                _.compose = function() { var args = arguments; var start = args.length - 1; return function() { var i = start; var result = args[start].apply(this, arguments); while (i--) result = args[i].call(this, result); return result } };
                _.after = function(times, func) { return function() { if (--times < 1) { return func.apply(this, arguments) } } };
                _.before = function(times, func) { var memo; return function() { if (--times > 0) { memo = func.apply(this, arguments) } if (times <= 1) func = null; return memo } };
                _.once = _.partial(_.before, 2);
                var hasEnumBug = !{ toString: null }.propertyIsEnumerable("toString");
                var nonEnumerableProps = ["valueOf", "isPrototypeOf", "toString", "propertyIsEnumerable", "hasOwnProperty", "toLocaleString"];

                function collectNonEnumProps(obj, keys) { var nonEnumIdx = nonEnumerableProps.length; var constructor = obj.constructor; var proto = _.isFunction(constructor) && constructor.prototype || ObjProto; var prop = "constructor"; if (_.has(obj, prop) && !_.contains(keys, prop)) keys.push(prop); while (nonEnumIdx--) { prop = nonEnumerableProps[nonEnumIdx]; if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) { keys.push(prop) } } }
                _.keys = function(obj) {
                    if (!_.isObject(obj)) return [];
                    if (nativeKeys) return nativeKeys(obj);
                    var keys = [];
                    for (var key in obj)
                        if (_.has(obj, key)) keys.push(key);
                    if (hasEnumBug) collectNonEnumProps(obj, keys);
                    return keys
                };
                _.allKeys = function(obj) { if (!_.isObject(obj)) return []; var keys = []; for (var key in obj) keys.push(key); if (hasEnumBug) collectNonEnumProps(obj, keys); return keys };
                _.values = function(obj) { var keys = _.keys(obj); var length = keys.length; var values = Array(length); for (var i = 0; i < length; i++) { values[i] = obj[keys[i]] } return values };
                _.mapObject = function(obj, iteratee, context) {
                    iteratee = cb(iteratee, context);
                    var keys = _.keys(obj),
                        length = keys.length,
                        results = {},
                        currentKey;
                    for (var index = 0; index < length; index++) {
                        currentKey = keys[index];
                        results[currentKey] = iteratee(obj[currentKey], currentKey, obj)
                    }
                    return results
                };
                _.pairs = function(obj) { var keys = _.keys(obj); var length = keys.length; var pairs = Array(length); for (var i = 0; i < length; i++) { pairs[i] = [keys[i], obj[keys[i]]] } return pairs };
                _.invert = function(obj) { var result = {}; var keys = _.keys(obj); for (var i = 0, length = keys.length; i < length; i++) { result[obj[keys[i]]] = keys[i] } return result };
                _.functions = _.methods = function(obj) { var names = []; for (var key in obj) { if (_.isFunction(obj[key])) names.push(key) } return names.sort() };
                _.extend = createAssigner(_.allKeys);
                _.extendOwn = _.assign = createAssigner(_.keys);
                _.findKey = function(obj, predicate, context) {
                    predicate = cb(predicate, context);
                    var keys = _.keys(obj),
                        key;
                    for (var i = 0, length = keys.length; i < length; i++) { key = keys[i]; if (predicate(obj[key], key, obj)) return key }
                };
                _.pick = function(object, oiteratee, context) {
                    var result = {},
                        obj = object,
                        iteratee, keys;
                    if (obj == null) return result;
                    if (_.isFunction(oiteratee)) {
                        keys = _.allKeys(obj);
                        iteratee = optimizeCb(oiteratee, context)
                    } else {
                        keys = flatten(arguments, false, false, 1);
                        iteratee = function(value, key, obj) { return key in obj };
                        obj = Object(obj)
                    }
                    for (var i = 0, length = keys.length; i < length; i++) { var key = keys[i]; var value = obj[key]; if (iteratee(value, key, obj)) result[key] = value }
                    return result
                };
                _.omit = function(obj, iteratee, context) {
                    if (_.isFunction(iteratee)) { iteratee = _.negate(iteratee) } else {
                        var keys = _.map(flatten(arguments, false, false, 1), String);
                        iteratee = function(value, key) { return !_.contains(keys, key) }
                    }
                    return _.pick(obj, iteratee, context)
                };
                _.defaults = createAssigner(_.allKeys, true);
                _.create = function(prototype, props) { var result = baseCreate(prototype); if (props) _.extendOwn(result, props); return result };
                _.clone = function(obj) { if (!_.isObject(obj)) return obj; return _.isArray(obj) ? obj.slice() : _.extend({}, obj) };
                _.tap = function(obj, interceptor) { interceptor(obj); return obj };
                _.isMatch = function(object, attrs) {
                    var keys = _.keys(attrs),
                        length = keys.length;
                    if (object == null) return !length;
                    var obj = Object(object);
                    for (var i = 0; i < length; i++) { var key = keys[i]; if (attrs[key] !== obj[key] || !(key in obj)) return false }
                    return true
                };
                var eq = function(a, b, aStack, bStack) {
                    if (a === b) return a !== 0 || 1 / a === 1 / b;
                    if (a == null || b == null) return a === b;
                    if (a instanceof _) a = a._wrapped;
                    if (b instanceof _) b = b._wrapped;
                    var className = toString.call(a);
                    if (className !== toString.call(b)) return false;
                    switch (className) {
                        case "[object RegExp]":
                        case "[object String]":
                            return "" + a === "" + b;
                        case "[object Number]":
                            if (+a !== +a) return +b !== +b;
                            return +a === 0 ? 1 / +a === 1 / b : +a === +b;
                        case "[object Date]":
                        case "[object Boolean]":
                            return +a === +b
                    }
                    var areArrays = className === "[object Array]";
                    if (!areArrays) {
                        if (typeof a != "object" || typeof b != "object") return false;
                        var aCtor = a.constructor,
                            bCtor = b.constructor;
                        if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor && _.isFunction(bCtor) && bCtor instanceof bCtor) && ("constructor" in a && "constructor" in b)) { return false }
                    }
                    aStack = aStack || [];
                    bStack = bStack || [];
                    var length = aStack.length;
                    while (length--) { if (aStack[length] === a) return bStack[length] === b }
                    aStack.push(a);
                    bStack.push(b);
                    if (areArrays) { length = a.length; if (length !== b.length) return false; while (length--) { if (!eq(a[length], b[length], aStack, bStack)) return false } } else {
                        var keys = _.keys(a),
                            key;
                        length = keys.length;
                        if (_.keys(b).length !== length) return false;
                        while (length--) { key = keys[length]; if (!(_.has(b, key) && eq(a[key], b[key], aStack, bStack))) return false }
                    }
                    aStack.pop();
                    bStack.pop();
                    return true
                };
                _.isEqual = function(a, b) { return eq(a, b) };
                _.isEmpty = function(obj) { if (obj == null) return true; if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0; return _.keys(obj).length === 0 };
                _.isElement = function(obj) { return !!(obj && obj.nodeType === 1) };
                _.isArray = nativeIsArray || function(obj) { return toString.call(obj) === "[object Array]" };
                _.isObject = function(obj) { var type = typeof obj; return type === "function" || type === "object" && !!obj };
                _.each(["Arguments", "Function", "String", "Number", "Date", "RegExp", "Error"], function(name) { _["is" + name] = function(obj) { return toString.call(obj) === "[object " + name + "]" } });
                if (!_.isArguments(arguments)) { _.isArguments = function(obj) { return _.has(obj, "callee") } }
                if (typeof /./ != "function" && typeof Int8Array != "object") { _.isFunction = function(obj) { return typeof obj == "function" || false } }
                _.isFinite = function(obj) { return isFinite(obj) && !isNaN(parseFloat(obj)) };
                _.isNaN = function(obj) { return _.isNumber(obj) && obj !== +obj };
                _.isBoolean = function(obj) { return obj === true || obj === false || toString.call(obj) === "[object Boolean]" };
                _.isNull = function(obj) { return obj === null };
                _.isUndefined = function(obj) { return obj === void 0 };
                _.has = function(obj, key) { return obj != null && hasOwnProperty.call(obj, key) };
                _.noConflict = function() { root._ = previousUnderscore; return this };
                _.identity = function(value) { return value };
                _.constant = function(value) { return function() { return value } };
                _.noop = function() {};
                _.property = property;
                _.propertyOf = function(obj) { return obj == null ? function() {} : function(key) { return obj[key] } };
                _.matcher = _.matches = function(attrs) { attrs = _.extendOwn({}, attrs); return function(obj) { return _.isMatch(obj, attrs) } };
                _.times = function(n, iteratee, context) {
                    var accum = Array(Math.max(0, n));
                    iteratee = optimizeCb(iteratee, context, 1);
                    for (var i = 0; i < n; i++) accum[i] = iteratee(i);
                    return accum
                };
                _.random = function(min, max) {
                    if (max == null) {
                        max = min;
                        min = 0
                    }
                    return min + Math.floor(Math.random() * (max - min + 1))
                };
                _.now = Date.now || function() { return (new Date).getTime() };
                var escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;", "`": "&#x60;" };
                var unescapeMap = _.invert(escapeMap);
                var createEscaper = function(map) { var escaper = function(match) { return map[match] }; var source = "(?:" + _.keys(map).join("|") + ")"; var testRegexp = RegExp(source); var replaceRegexp = RegExp(source, "g"); return function(string) { string = string == null ? "" : "" + string; return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string } };
                _.escape = createEscaper(escapeMap);
                _.unescape = createEscaper(unescapeMap);
                _.result = function(object, property, fallback) { var value = object == null ? void 0 : object[property]; if (value === void 0) { value = fallback } return _.isFunction(value) ? value.call(object) : value };
                var idCounter = 0;
                _.uniqueId = function(prefix) { var id = ++idCounter + ""; return prefix ? prefix + id : id };
                _.templateSettings = { evaluate: /<%([\s\S]+?)%>/g, interpolate: /<%=([\s\S]+?)%>/g, escape: /<%-([\s\S]+?)%>/g };
                var noMatch = /(.)^/;
                var escapes = { "'": "'", "\\": "\\", "\r": "r", "\n": "n", "\u2028": "u2028", "\u2029": "u2029" };
                var escaper = /\\|'|\r|\n|\u2028|\u2029/g;
                var escapeChar = function(match) { return "\\" + escapes[match] };
                _.template = function(text, settings, oldSettings) {
                    if (!settings && oldSettings) settings = oldSettings;
                    settings = _.defaults({}, settings, _.templateSettings);
                    var matcher = RegExp([(settings.escape || noMatch).source, (settings.interpolate || noMatch).source, (settings.evaluate || noMatch).source].join("|") + "|$", "g");
                    var index = 0;
                    var source = "__p+='";
                    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
                        source += text.slice(index, offset).replace(escaper, escapeChar);
                        index = offset + match.length;
                        if (escape) { source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'" } else if (interpolate) { source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'" } else if (evaluate) { source += "';\n" + evaluate + "\n__p+='" }
                        return match
                    });
                    source += "';\n";
                    if (!settings.variable) source = "with(obj||{}){\n" + source + "}\n";
                    source = "var __t,__p='',__j=Array.prototype.join," + "print=function(){__p+=__j.call(arguments,'');};\n" + source + "return __p;\n";
                    try { var render = new Function(settings.variable || "obj", "_", source) } catch (e) { e.source = source; throw e }
                    var template = function(data) { return render.call(this, data, _) };
                    var argument = settings.variable || "obj";
                    template.source = "function(" + argument + "){\n" + source + "}";
                    return template
                };
                _.chain = function(obj) {
                    var instance = _(obj);
                    instance._chain = true;
                    return instance
                };
                var result = function(instance, obj) { return instance._chain ? _(obj).chain() : obj };
                _.mixin = function(obj) {
                    _.each(_.functions(obj), function(name) {
                        var func = _[name] = obj[name];
                        _.prototype[name] = function() {
                            var args = [this._wrapped];
                            push.apply(args, arguments);
                            return result(this, func.apply(_, args))
                        }
                    })
                };
                _.mixin(_);
                _.each(["pop", "push", "reverse", "shift", "sort", "splice", "unshift"], function(name) {
                    var method = ArrayProto[name];
                    _.prototype[name] = function() {
                        var obj = this._wrapped;
                        method.apply(obj, arguments);
                        if ((name === "shift" || name === "splice") && obj.length === 0) delete obj[0];
                        return result(this, obj)
                    }
                });
                _.each(["concat", "join", "slice"], function(name) {
                    var method = ArrayProto[name];
                    _.prototype[name] = function() { return result(this, method.apply(this._wrapped, arguments)) }
                });
                _.prototype.value = function() { return this._wrapped };
                _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;
                _.prototype.toString = function() { return "" + this._wrapped };
                if (typeof define === "function" && define.amd) { define("underscore", [], function() { return _ }) }
            }).call(this)
        }, {}],
        5: [function(require, module, exports) {}, {}],
        6: [function(require, module, exports) {
            (function(process) {
                function normalizeArray(parts, allowAboveRoot) {
                    var up = 0;
                    for (var i = parts.length - 1; i >= 0; i--) {
                        var last = parts[i];
                        if (last === ".") { parts.splice(i, 1) } else if (last === "..") {
                            parts.splice(i, 1);
                            up++
                        } else if (up) {
                            parts.splice(i, 1);
                            up--
                        }
                    }
                    if (allowAboveRoot) { for (; up--; up) { parts.unshift("..") } }
                    return parts
                }
                var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
                var splitPath = function(filename) { return splitPathRe.exec(filename).slice(1) };
                exports.resolve = function() {
                    var resolvedPath = "",
                        resolvedAbsolute = false;
                    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
                        var path = i >= 0 ? arguments[i] : process.cwd();
                        if (typeof path !== "string") { throw new TypeError("Arguments to path.resolve must be strings") } else if (!path) { continue }
                        resolvedPath = path + "/" + resolvedPath;
                        resolvedAbsolute = path.charAt(0) === "/"
                    }
                    resolvedPath = normalizeArray(filter(resolvedPath.split("/"), function(p) { return !!p }), !resolvedAbsolute).join("/");
                    return (resolvedAbsolute ? "/" : "") + resolvedPath || "."
                };
                exports.normalize = function(path) {
                    var isAbsolute = exports.isAbsolute(path),
                        trailingSlash = substr(path, -1) === "/";
                    path = normalizeArray(filter(path.split("/"), function(p) { return !!p }), !isAbsolute).join("/");
                    if (!path && !isAbsolute) { path = "." }
                    if (path && trailingSlash) { path += "/" }
                    return (isAbsolute ? "/" : "") + path
                };
                exports.isAbsolute = function(path) { return path.charAt(0) === "/" };
                exports.join = function() { var paths = Array.prototype.slice.call(arguments, 0); return exports.normalize(filter(paths, function(p, index) { if (typeof p !== "string") { throw new TypeError("Arguments to path.join must be strings") } return p }).join("/")) };
                exports.relative = function(from, to) {
                    from = exports.resolve(from).substr(1);
                    to = exports.resolve(to).substr(1);

                    function trim(arr) { var start = 0; for (; start < arr.length; start++) { if (arr[start] !== "") break } var end = arr.length - 1; for (; end >= 0; end--) { if (arr[end] !== "") break } if (start > end) return []; return arr.slice(start, end - start + 1) }
                    var fromParts = trim(from.split("/"));
                    var toParts = trim(to.split("/"));
                    var length = Math.min(fromParts.length, toParts.length);
                    var samePartsLength = length;
                    for (var i = 0; i < length; i++) { if (fromParts[i] !== toParts[i]) { samePartsLength = i; break } }
                    var outputParts = [];
                    for (var i = samePartsLength; i < fromParts.length; i++) { outputParts.push("..") }
                    outputParts = outputParts.concat(toParts.slice(samePartsLength));
                    return outputParts.join("/")
                };
                exports.sep = "/";
                exports.delimiter = ":";
                exports.dirname = function(path) {
                    var result = splitPath(path),
                        root = result[0],
                        dir = result[1];
                    if (!root && !dir) { return "." }
                    if (dir) { dir = dir.substr(0, dir.length - 1) }
                    return root + dir
                };
                exports.basename = function(path, ext) { var f = splitPath(path)[2]; if (ext && f.substr(-1 * ext.length) === ext) { f = f.substr(0, f.length - ext.length) } return f };
                exports.extname = function(path) { return splitPath(path)[3] };

                function filter(xs, f) { if (xs.filter) return xs.filter(f); var res = []; for (var i = 0; i < xs.length; i++) { if (f(xs[i], i, xs)) res.push(xs[i]) } return res }
                var substr = "ab".substr(-1) === "b" ? function(str, start, len) { return str.substr(start, len) } : function(str, start, len) { if (start < 0) start = str.length + start; return str.substr(start, len) }
            }).call(this, require("_process"))
        }, { _process: 7 }],
        7: [function(require, module, exports) {
            var process = module.exports = {};
            var cachedSetTimeout;
            var cachedClearTimeout;

            function defaultSetTimout() { throw new Error("setTimeout has not been defined") }

            function defaultClearTimeout() { throw new Error("clearTimeout has not been defined") }(function() { try { if (typeof setTimeout === "function") { cachedSetTimeout = setTimeout } else { cachedSetTimeout = defaultSetTimout } } catch (e) { cachedSetTimeout = defaultSetTimout } try { if (typeof clearTimeout === "function") { cachedClearTimeout = clearTimeout } else { cachedClearTimeout = defaultClearTimeout } } catch (e) { cachedClearTimeout = defaultClearTimeout } })();

            function runTimeout(fun) { if (cachedSetTimeout === setTimeout) { return setTimeout(fun, 0) } if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) { cachedSetTimeout = setTimeout; return setTimeout(fun, 0) } try { return cachedSetTimeout(fun, 0) } catch (e) { try { return cachedSetTimeout.call(null, fun, 0) } catch (e) { return cachedSetTimeout.call(this, fun, 0) } } }

            function runClearTimeout(marker) { if (cachedClearTimeout === clearTimeout) { return clearTimeout(marker) } if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) { cachedClearTimeout = clearTimeout; return clearTimeout(marker) } try { return cachedClearTimeout(marker) } catch (e) { try { return cachedClearTimeout.call(null, marker) } catch (e) { return cachedClearTimeout.call(this, marker) } } }
            var queue = [];
            var draining = false;
            var currentQueue;
            var queueIndex = -1;

            function cleanUpNextTick() {
                if (!draining || !currentQueue) { return }
                draining = false;
                if (currentQueue.length) { queue = currentQueue.concat(queue) } else { queueIndex = -1 }
                if (queue.length) { drainQueue() }
            }

            function drainQueue() {
                if (draining) { return }
                var timeout = runTimeout(cleanUpNextTick);
                draining = true;
                var len = queue.length;
                while (len) {
                    currentQueue = queue;
                    queue = [];
                    while (++queueIndex < len) { if (currentQueue) { currentQueue[queueIndex].run() } }
                    queueIndex = -1;
                    len = queue.length
                }
                currentQueue = null;
                draining = false;
                runClearTimeout(timeout)
            }
            process.nextTick = function(fun) {
                var args = new Array(arguments.length - 1);
                if (arguments.length > 1) { for (var i = 1; i < arguments.length; i++) { args[i - 1] = arguments[i] } }
                queue.push(new Item(fun, args));
                if (queue.length === 1 && !draining) { runTimeout(drainQueue) }
            };

            function Item(fun, array) {
                this.fun = fun;
                this.array = array
            }
            Item.prototype.run = function() { this.fun.apply(null, this.array) };
            process.title = "browser";
            process.browser = true;
            process.env = {};
            process.argv = [];
            process.version = "";
            process.versions = {};

            function noop() {}
            process.on = noop;
            process.addListener = noop;
            process.once = noop;
            process.off = noop;
            process.removeListener = noop;
            process.removeAllListeners = noop;
            process.emit = noop;
            process.prependListener = noop;
            process.prependOnceListener = noop;
            process.listeners = function(name) { return [] };
            process.binding = function(name) { throw new Error("process.binding is not supported") };
            process.cwd = function() { return "/" };
            process.chdir = function(dir) { throw new Error("process.chdir is not supported") };
            process.umask = function() { return 0 }
        }, {}]
    }, {}, [1])(1)
});

function XmlModel(xml) {
    if (!(this instanceof XmlModel)) return new XmlModel(xml);

    function getRoot(xml) { var struct = $(xml).find("featureModel struct").get(); if (struct.length !== 1) throw "model does not have exactly one struct"; var children = $(struct[0]).children().get(); if (children.length !== 1) throw "model does not have exactly one root"; return $(children[0]) }

    function getRules() { return $(xml).find("constraints rule").map(function() { var children = $(this).children(":not(description)").get(); if (children.length !== 1) throw "rule does not have exactly one child"; return children[0] }) }
    this.xml = xml;
    this.root = getRoot(xml);
    this.rules = getRules()
}
XmlModel.prototype.traverse = function(fn, pushFn, popFn) {
    function traverse(node, parent, level) {
        if (["feature", "and", "or", "alt"].includes(node.prop("tagName"))) fn(node, parent, level);
        if (node.children().length > 0) {
            if (pushFn) pushFn();
            node.children().get().forEach(function(child) { traverse($(child), node, level + 1) });
            if (popFn) popFn()
        }
    }
    if (pushFn) pushFn();
    traverse(this.root, null, 0);
    if (popFn) popFn()
};

function Model(xmlModel) {
    if (!(this instanceof Model)) return new Model(xmlModel);

    function buildFeatureList(xmlModel) {
        var features = [];
        xmlModel.traverse(function(node, parent) { features.push(new Feature(node, parent, node.children())) });
        return features
    }
    this.xmlModel = xmlModel;
    this.features = buildFeatureList(xmlModel);
    this.rootFeature = this.features[0];
    this.getFeature = featureGetter("features");
    this.constraintSolver = new ConstraintSolver(this)
}