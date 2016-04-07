var expect      = require('chai').expect;
var resolve     = require('path').resolve;
var sep         = require('path').sep;
var Promise     = require('pinkie');
var stackParser = require('error-stack-parser');
var stripAnsi   = require('strip-ansi');
var sortBy      = require('lodash').sortBy;
var Compiler    = require('../../lib/compiler');
var Role        = require('../../lib/api/common/role');
var Hybrid      = require('../../lib/api/common/hybrid');

describe('Compiler', function () {
    this.timeout(20000);

    // FIXME: Babel errors always contain POSIX-format file paths.
    function posixResolve (path) {
        return resolve(path).replace(new RegExp('\\\\', 'g'), '/');
    }

    function compile (sources) {
        sources = Array.isArray(sources) ? sources : [sources];

        sources = sources.map(function (filename) {
            return resolve(filename);
        });

        var compiler = new Compiler(sources);

        return compiler.getTests()
            .then(function (tests) {
                var fixtures = tests
                    .reduce(function (fxtrs, test) {
                        if (fxtrs.indexOf(test.fixture) < 0)
                            fxtrs.push(test.fixture);

                        return fxtrs;
                    }, []);

                return {
                    tests:    sortBy(tests, 'name'),
                    fixtures: sortBy(fixtures, 'name')
                };
            });
    }


    function assertError (err, expected) {
        expect(err.message).eql(expected.message);
        expect(err.stack.indexOf(expected.message)).eql(0);

        assertStack(err, expected);
    }

    function assertGlobalsAPIError (err, expected) {
        assertError(err, expected);

        expect(err.stack.indexOf(expected.message + '\n\n' + expected.callsite)).eql(0);
        expect(stripAnsi(err.coloredStack)).eql(err.stack);
    }

    function assertStack (err, expected) {
        // HACK: stackParser can't handle empty stacks correctly
        // (it treats error messages as stack frames).
        // Therefore we add this dummy stack frame to make things work
        if (!expected.stackTop)
            err.stack += '\n    at (<empty-marker>:1:1)';

        var parsedStack = stackParser.parse(err);

        if (expected.stackTop) {
            var expectedStackTop = Array.isArray(expected.stackTop) ? expected.stackTop : [expected.stackTop];

            parsedStack.forEach(function (frame, idx) {
                var filename   = frame.fileName;
                var isInternal = frame.fileName.indexOf('internal/') === 0 ||
                                 frame.fileName.indexOf(sep) < 0;

                // NOTE: assert that stack is clean from internals
                expect(isInternal).to.be.false;
                expect(filename).not.to.contain(sep + 'babel-');
                expect(filename).not.to.contain(sep + 'babylon' + sep);
                expect(filename).not.to.contain(sep + 'core-js' + sep);

                if (expectedStackTop[idx])
                    expect(filename).eql(expectedStackTop[idx]);
            });
        }
        else {
            expect(parsedStack.length).eql(1);
            expect(parsedStack[0].fileName).eql('<empty-marker>');
        }
    }

    it('Should compile test files and their dependencies', function () {
        var sources = [
            'test/server/data/test-suites/basic/testfile1.js',
            'test/server/data/test-suites/basic/testfile2.js'
        ];

        return compile(sources)
            .then(function (compiled) {
                var testfile1 = resolve('test/server/data/test-suites/basic/testfile1.js');
                var testfile2 = resolve('test/server/data/test-suites/basic/testfile2.js');
                var tests     = compiled.tests;
                var fixtures  = compiled.fixtures;

                expect(tests.length).eql(4);
                expect(fixtures.length).eql(3);

                expect(fixtures[0].name).eql('Fixture1');
                expect(fixtures[0].path).eql(testfile1);
                expect(fixtures[0].pageUrl).eql('about:blank');

                expect(fixtures[1].name).eql('Fixture2');
                expect(fixtures[1].path).eql(testfile1);
                expect(fixtures[1].pageUrl).eql('http://example.org');

                expect(fixtures[2].name).eql('Fixture3');
                expect(fixtures[2].path).eql(testfile2);
                expect(fixtures[2].pageUrl).eql('https://example.com');

                expect(tests[0].name).eql('Fixture1Test1');
                expect(tests[0].fixture).eql(fixtures[0]);

                expect(tests[1].name).eql('Fixture1Test2');
                expect(tests[1].fixture).eql(fixtures[0]);

                expect(tests[2].name).eql('Fixture2Test1');
                expect(tests[2].fixture).eql(fixtures[1]);

                expect(tests[3].name).eql('Fixture3Test1');
                expect(tests[3].fixture).eql(fixtures[2]);

                return Promise.all(tests.map(function (test) {
                    return test.fn();
                }));
            })
            .then(function (results) {
                expect(results).eql([
                    'F1T1: Hey from dep1',
                    'F1T2',
                    'F2T1',
                    'F3T1: Hey from dep1 and dep2'
                ]);
            });
    });

    it('Should provide common API functions via lib dependency', function () {
        return compile('test/server/data/test-suites/common-runtime-dep/testfile.js')
            .then(function (compiled) {
                var commons = compiled.tests[0].fn();

                expect(commons.Role).eql(Role);
                expect(commons.Hybrid).eql(Hybrid);
            });
    });

    it('Should not leak globals to dependencies and test body', function () {
        return compile('test/server/data/test-suites/globals-in-dep/testfile.js')
            .then(function (compiled) {
                expect(compiled.tests[0].fn()).to.be.true;
            });
    });

    it('Should compile mixed content', function () {
        var sources = [
            'test/server/data/test-suites/mixed-content/testfile.js',
            'test/server/data/test-suites/mixed-content/legacy.test.js',
            'test/server/data/test-suites/mixed-content/non-testfile.js'
        ];

        return compile(sources)
            .then(function (compiled) {
                expect(compiled.tests.length).eql(2);

                expect(compiled.tests[0].name).eql('1.Test');
                expect(compiled.tests[0].isLegacy).to.be.undefined;

                expect(compiled.tests[1].name).eql('2.LegacyTest');
                expect(compiled.tests[1].isLegacy).to.be.true;
            });
    });

    it('Should gracefully handle fixture pages without protocol', function () {
        return compile('test/server/data/test-suites/fixture-page-without-protocol/testfile.js')
            .then(function (compiled) {
                expect(compiled.tests[0].fixture.pageUrl).eql('http://example.org');
                expect(compiled.tests[1].fixture.pageUrl).eql('http://example.org');
            });
    });

    describe('Errors', function () {
        it("Should raise error if the specified source file doesn't exists", function () {
            return compile('does/not/exists.js')
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    expect(err.message).eql('Cannot find a test source file at "' +
                                            resolve('does/not/exists.js') + '".');
                });
        });

        it('Should raise error if test dependency has a syntax error', function () {
            var testfile = resolve('test/server/data/test-suites/syntax-error-in-dep/testfile.js');
            var dep      = posixResolve('test/server/data/test-suites/syntax-error-in-dep/dep.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertError(err, {
                        stackTop: testfile,

                        message: 'Cannot prepare tests due to an error.\n\n' +
                                 ' SyntaxError: ' + dep + ': Unexpected token (1:7)'
                    });
                });
        });

        it("Should raise error if dependency can't require a module", function () {
            var testfile = resolve('test/server/data/test-suites/require-error-in-dep/testfile.js');
            var dep      = resolve('test/server/data/test-suites/require-error-in-dep/dep.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertError(err, {
                        stackTop: [
                            dep,
                            testfile
                        ],

                        message: 'Cannot prepare tests due to an error.\n\n' +
                                 " Error: Cannot find module './yo'"
                    });
                });
        });

        it('Should raise error if dependency throws runtime error', function () {
            var testfile = resolve('test/server/data/test-suites/runtime-error-in-dep/testfile.js');
            var dep      = resolve('test/server/data/test-suites/runtime-error-in-dep/dep.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertError(err, {
                        stackTop: [
                            dep,
                            testfile
                        ],

                        message: 'Cannot prepare tests due to an error.\n\n' +
                                 ' Error: Hey ya!'
                    });
                });
        });

        it('Should raise error if test file has a syntax error', function () {
            var testfile = posixResolve('test/server/data/test-suites/syntax-error-in-testfile/testfile.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertError(err, {
                        stackTop: null,

                        message: 'Cannot prepare tests due to an error.\n\n' +
                                 ' SyntaxError: ' + testfile + ': Unexpected token (1:7)'
                    });
                });
        });

        it("Should raise error if test file can't require a module", function () {
            var testfile = resolve('test/server/data/test-suites/require-error-in-testfile/testfile.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertError(err, {
                        stackTop: testfile,

                        message: 'Cannot prepare tests due to an error.\n\n' +
                                 " Error: Cannot find module './yo'"
                    });
                });
        });

        it('Should raise error if test file throws runtime error', function () {
            var testfile = resolve('test/server/data/test-suites/runtime-error-in-testfile/testfile.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertError(err, {
                        stackTop: testfile,

                        message: 'Cannot prepare tests due to an error.\n\n' +
                                 ' Error: Hey ya!'
                    });
                });
        });

        it('Should raise error if fixture name is not a string', function () {
            var testfile = resolve('test/server/data/test-suites/fixture-name-is-not-a-string/testfile.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertGlobalsAPIError(err, {
                        stackTop: testfile,

                        message: 'The fixture name is expected to be a string, but it was "object".',

                        callsite: '    2 |// (to treat a file as a test, it requires at least one fixture definition\n' +
                                  '    3 |//  with the string argument).\n' +
                                  '    4 |\n' +
                                  '    5 |fixture `Yo`;\n' +
                                  '    6 |\n' +
                                  ' >  7 |fixture({ answer: 42 });\n' +
                                  '    8 |\n' +
                                  "    9 |test('Test', () => {\n" +
                                  "   10 |    return 'yo';\n" +
                                  '   11 |});\n' +
                                  '   12 |'
                    });
                });
        });

        it('Should raise error if fixture page is not a string', function () {
            var testfile = resolve('test/server/data/test-suites/fixture-page-is-not-a-string/testfile.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertGlobalsAPIError(err, {
                        stackTop: testfile,

                        message: 'The page URL is expected to be a string, but it was "object".',

                        callsite: '   1 |fixture `Yo`\n' +
                                  ' > 2 |    .page({ answer: 42 });\n' +
                                  '   3 |\n' +
                                  "   4 |test('Test', () => {\n" +
                                  "   5 |    return 'yo';\n" +
                                  '   6 |});\n' +
                                  '   7 |'
                    });
                });
        });

        it('Should raise error if test name is not a string', function () {
            var testfile = resolve('test/server/data/test-suites/test-name-is-not-a-string/testfile.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertGlobalsAPIError(err, {
                        stackTop: testfile,

                        message: 'The test name is expected to be a string, but it was "number".',

                        callsite: '    4 |// (to treat a file as a test, it requires at least one fixture definition\n' +
                                  '    5 |//  with the string argument).\n' +
                                  "    6 |test('TheAnswer', () => {\n    7 |});\n" +
                                  '    8 |\n' +
                                  ' >  9 |test(42, () => {\n' +
                                  '   10 |});\n' +
                                  '   11 |'
                    });
                });
        });

        it('Should raise error if test body is not a function', function () {
            var testfile = resolve('test/server/data/test-suites/test-body-is-not-a-function/testfile.js');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection expected');
                })
                .catch(function (err) {
                    assertGlobalsAPIError(err, {
                        stackTop: testfile,

                        message: 'The test body is expected to be a function, but it was "string".',

                        callsite: '   1 |fixture `Test body is not a function`;\n' +
                                  '   2 |\n' +
                                  " > 3 |test('Test', 'Yo');\n" +
                                  '   4 |'
                    });
                });
        });
    });

    describe('Raw data compiler', function () {
        it('Should compile test files', function () {
            var sources = ['test/server/data/test-suites/raw/test.testcafe'];

            return compile(sources)
                .then(function (compiled) {
                    var testfile = resolve('test/server/data/test-suites/raw/test.testcafe');
                    var tests    = compiled.tests;
                    var fixtures = compiled.fixtures;

                    expect(tests.length).eql(3);
                    expect(fixtures.length).eql(2);

                    expect(fixtures[0].name).eql('Fixture1');
                    expect(fixtures[0].path).eql(testfile);
                    expect(fixtures[0].pageUrl).eql('about:blank');

                    expect(fixtures[1].name).eql('Fixture2');
                    expect(fixtures[1].path).eql(testfile);
                    expect(fixtures[1].pageUrl).eql('http://example.org');

                    expect(tests[0].name).eql('Fixture1Test1');
                    expect(tests[0].fixture).eql(fixtures[0]);

                    expect(tests[1].name).eql('Fixture1Test2');
                    expect(tests[1].fixture).eql(fixtures[0]);

                    expect(tests[2].name).eql('Fixture2Test1');
                    expect(tests[2].fixture).eql(fixtures[1]);
                });
        });

        it('Should raise an error if it cannot parse a raw file', function () {
            var testfile = resolve('test/server/data/test-suites/raw/invalid.testcafe');

            return compile(testfile)
                .then(function () {
                    throw new Error('Promise rejection is expected');
                })
                .catch(function (err) {
                    expect(err.message).eql('Cannot parse a test source file in the raw format at "' + testfile +
                                            '" due to an error.\n\n SyntaxError: Unexpected token i');
                });
        });

        describe('test.fn()', function () {
            var TestRunMock = function (expectedError) {
                this.commands      = [];
                this.expectedError = expectedError;
            };

            TestRunMock.prototype.executeCommand = function (command) {
                this.commands.push(command);

                return this.expectedError ? Promise.reject(new Error(this.expectedError)) : Promise.resolve();
            };

            it('Should be resolved if the test passed', function () {
                var sources = ['test/server/data/test-suites/raw/test.testcafe'];
                var test    = null;
                var testRun = new TestRunMock();

                return compile(sources)
                    .then(function (compiled) {
                        test = compiled.tests[0];

                        return test.fn(testRun);
                    })
                    .then(function () {
                        expect(testRun.commands.length).eql(2);
                    });
            });

            it('Should be rejected if the test failed', function () {
                var sources       = ['test/server/data/test-suites/raw/test.testcafe'];
                var expectedError = 'test-error';
                var testRun       = new TestRunMock(expectedError);

                return compile(sources)
                    .then(function (compiled) {
                        return compiled.tests[0].fn(testRun);
                    })
                    .then(function () {
                        throw new Error('Promise rejection is expected');
                    })
                    .catch(function (err) {
                        expect(err.message).eql(expectedError);
                        expect(testRun.commands.length).eql(1);
                    });
            });
        });
    });
});
