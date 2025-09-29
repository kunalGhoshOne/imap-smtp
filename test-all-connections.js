const { spawn } = require('child_process');
const path = require('path');

class TestRunner {
  constructor() {
    this.results = {
      smtp: { status: 'pending', passed: 0, failed: 0, output: '' },
      imap: { status: 'pending', passed: 0, failed: 0, output: '' },
      existing: { status: 'pending', passed: 0, failed: 0, output: '' }
    };
  }

  async runTest(testFile, testName) {
    return new Promise((resolve) => {
      console.log(`\n🚀 Running ${testName} tests...`);
      console.log('='.repeat(50));

      const testProcess = spawn('node', [testFile], {
        stdio: 'pipe',
        cwd: process.cwd()
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      testProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        process.stderr.write(text);
      });

      testProcess.on('close', (code) => {
        const fullOutput = output + errorOutput;

        // Parse results from output
        const passedMatches = fullOutput.match(/(\d+) passed/g) || [];
        const failedMatches = fullOutput.match(/(\d+) failed/g) || [];

        let totalPassed = 0;
        let totalFailed = 0;

        passedMatches.forEach(match => {
          const num = parseInt(match.match(/(\d+)/)[1]);
          totalPassed += num;
        });

        failedMatches.forEach(match => {
          const num = parseInt(match.match(/(\d+)/)[1]);
          totalFailed += num;
        });

        const result = {
          status: code === 0 ? 'completed' : 'failed',
          passed: totalPassed,
          failed: totalFailed,
          output: fullOutput,
          exitCode: code
        };

        console.log(`\n📊 ${testName} Results: ${totalPassed} passed, ${totalFailed} failed (exit code: ${code})`);
        resolve(result);
      });

      testProcess.on('error', (error) => {
        console.error(`❌ Failed to start ${testName} test:`, error.message);
        resolve({
          status: 'error',
          passed: 0,
          failed: 1,
          output: `Error: ${error.message}`,
          exitCode: 1
        });
      });
    });
  }

  async runExistingTests() {
    console.log('\n🧪 Running existing test suite...');
    console.log('='.repeat(50));

    const existingTests = [
      { file: 'test-send.js', name: 'Email Send Test' },
      { file: 'test-multi-port.js', name: 'Multi Port Test' },
      { file: 'test-lmtp.js', name: 'LMTP Test' },
      { file: 'test-ip-selection.js', name: 'IP Selection Test' },
      { file: 'test-smtp-auth.js', name: 'SMTP Auth Test' },
      { file: 'test-separate-tables.js', name: 'Separate Tables Test' }
    ];

    let totalPassed = 0;
    let totalFailed = 0;
    let output = '';

    for (const test of existingTests) {
      try {
        const testPath = path.join(process.cwd(), test.file);
        const result = await this.runTest(testPath, test.name);

        totalPassed += result.passed;
        totalFailed += result.failed;
        output += `\n--- ${test.name} ---\n${result.output}\n`;

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between tests
      } catch (error) {
        console.error(`❌ Failed to run ${test.name}:`, error.message);
        totalFailed++;
        output += `\n--- ${test.name} ---\nError: ${error.message}\n`;
      }
    }

    return {
      status: 'completed',
      passed: totalPassed,
      failed: totalFailed,
      output
    };
  }

  async runAllTests() {
    console.log('🎯 Starting Comprehensive Email Server Test Suite');
    console.log('=' .repeat(60));
    console.log('This will test all SMTP and IMAP connections and functionality');
    console.log('=' .repeat(60));

    const startTime = Date.now();

    try {
      // Run SMTP connection tests
      this.results.smtp = await this.runTest(
        path.join(process.cwd(), 'test-smtp-connection.js'),
        'SMTP Connection'
      );

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Run IMAP connection tests
      this.results.imap = await this.runTest(
        path.join(process.cwd(), 'test-imap-connection.js'),
        'IMAP Connection'
      );

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Run existing tests
      this.results.existing = await this.runExistingTests();

    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    this.printFinalResults(duration);
  }

  printFinalResults(duration) {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 FINAL TEST RESULTS');
    console.log('='.repeat(60));

    const categories = [
      { name: 'SMTP Connection Tests', key: 'smtp' },
      { name: 'IMAP Connection Tests', key: 'imap' },
      { name: 'Existing Functionality Tests', key: 'existing' }
    ];

    let grandTotalPassed = 0;
    let grandTotalFailed = 0;

    categories.forEach(category => {
      const result = this.results[category.key];
      const status = result.status === 'completed' ? '✅' : '❌';

      console.log(`\n${status} ${category.name}:`);
      console.log(`   Passed: ${result.passed}`);
      console.log(`   Failed: ${result.failed}`);
      console.log(`   Status: ${result.status}`);

      grandTotalPassed += result.passed;
      grandTotalFailed += result.failed;
    });

    console.log('\n' + '-'.repeat(40));
    console.log(`🎯 GRAND TOTAL:`);
    console.log(`   ✅ Passed: ${grandTotalPassed}`);
    console.log(`   ❌ Failed: ${grandTotalFailed}`);
    console.log(`   ⏱️  Duration: ${duration}s`);

    const successRate = grandTotalPassed + grandTotalFailed > 0
      ? ((grandTotalPassed / (grandTotalPassed + grandTotalFailed)) * 100).toFixed(1)
      : 0;

    console.log(`   📊 Success Rate: ${successRate}%`);

    if (grandTotalFailed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Your email server is working perfectly!');
    } else if (successRate >= 80) {
      console.log('\n🚀 Most tests passed! Email server is mostly functional with minor issues.');
    } else if (successRate >= 50) {
      console.log('\n⚠️  Some tests failed. Email server has significant issues that need attention.');
    } else {
      console.log('\n❌ Many tests failed. Email server needs major fixes.');
    }

    console.log('\n📋 Test Details:');
    console.log('   • SMTP ports tested: 25, 587, 465, 2525');
    console.log('   • IMAP ports tested: 143, 993');
    console.log('   • Protocol commands tested: HELO/EHLO, MAIL FROM, RCPT TO, DATA, QUIT');
    console.log('   • IMAP commands tested: CAPABILITY, LOGIN, SELECT, FETCH, SEARCH, UID');
    console.log('   • Additional tests: Auth, LMTP, Multi-port, IP selection');

    console.log('\n' + '='.repeat(60));
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    // Check if server is running on any expected port
    const net = require('net');
    const ports = [2525, 25, 587, 465, 143, 993, 24];
    const runningPorts = [];

    for (const port of ports) {
      try {
        await new Promise((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(1000);

          socket.on('connect', () => {
            runningPorts.push(port);
            socket.destroy();
            resolve();
          });

          socket.on('error', () => resolve());
          socket.on('timeout', () => {
            socket.destroy();
            resolve();
          });

          socket.connect(port, 'localhost');
        });
      } catch (error) {
        // Port not accessible
      }
    }

    if (runningPorts.length === 0) {
      console.log('❌ No email servers detected running on expected ports');
      console.log('💡 Please start the server first: npm start');
      console.log('Expected ports: SMTP (25, 587, 465, 2525), IMAP (143, 993), LMTP (24)');
      return false;
    }

    console.log(`✅ Found servers running on ports: ${runningPorts.join(', ')}`);
    return true;
  }
}

async function main() {
  const testRunner = new TestRunner();

  console.log('📧 Email Server Comprehensive Test Suite');
  console.log('Testing SMTP and IMAP connections and functionality\n');

  // Check if servers are running
  const prerequisitesPassed = await testRunner.checkPrerequisites();
  if (!prerequisitesPassed) {
    process.exit(1);
  }

  console.log('\n⏳ Starting tests in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  await testRunner.runAllTests();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test suite interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Test suite terminated');
  process.exit(1);
});

main().catch(error => {
  console.error('💥 Test suite failed:', error.message);
  process.exit(1);
});