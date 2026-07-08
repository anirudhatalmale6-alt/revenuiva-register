const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Square Mobile Payments SDK ships CorePaymentCard/LCRCore/SquareReader nested
 * inside SquareMobilePaymentsSDK.framework/Frameworks/. iOS can't resolve them
 * via @rpath at launch → "Library not loaded: @rpath/CorePaymentCard.framework"
 * crash. Square's fix is a Run Script build phase that runs the framework's
 * `setup` script, and it MUST run AFTER `[CP] Embed Pods Frameworks`.
 *
 * Expo prebuild never adds this phase. This plugin injects it into the Podfile
 * `post_install` hook (which runs during pod install, after CocoaPods has added
 * the [CP] Embed Pods Frameworks phase), so `new_shell_script_build_phase`
 * appends it LAST on the app target — the required order.
 *
 * Ref: Square dev forums + github.com/square/in-app-payments-react-native-plugin/issues/236
 */

// Ruby injected into the Podfile post_install block. Single-quoted JS strings
// so ${...} stays literal for the shell. The shell script itself is a Ruby
// double-quoted string where ${...} is literal (Ruby interpolates with #{}).
const RUBY_SNIPPET = [
  '    # >>> Square Mobile Payments SDK setup build phase (added by withSquareSetup) >>>',
  '    installer.aggregate_targets.each do |aggregate_target|',
  '      user_project = aggregate_target.user_project',
  '      next if user_project.nil?',
  '      user_project.native_targets.each do |t|',
  '        next unless t.product_type == "com.apple.product-type.application"',
  '        unless t.shell_script_build_phases.any? { |p| p.name == "Square SDK Setup" }',
  '          phase = t.new_shell_script_build_phase("Square SDK Setup")',
  '          phase.shell_path = "/bin/sh"',
  '          phase.shell_script = "SETUP_SCRIPT=\\"${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}/SquareMobilePaymentsSDK.framework/setup\\"\\nif [ -f \\"$SETUP_SCRIPT\\" ]; then\\n  \\"$SETUP_SCRIPT\\"\\nfi\\n"',
  '        end',
  '      end',
  '      user_project.save',
  '    end',
  '    # <<< Square Mobile Payments SDK setup build phase <<<',
  '',
].join('\n');

const withSquareSetup = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes('Square SDK Setup')) {
        return config; // already injected
      }

      // Inject at the very start of the post_install block so it runs during
      // pod install; new_shell_script_build_phase appends the phase last.
      const marker = /post_install do \|installer\|\n/;
      if (marker.test(contents)) {
        contents = contents.replace(marker, (m) => m + RUBY_SNIPPET + '\n');
        fs.writeFileSync(podfilePath, contents);
      } else {
        // No post_install block — append one.
        contents += `\npost_install do |installer|\n${RUBY_SNIPPET}\nend\n`;
        fs.writeFileSync(podfilePath, contents);
      }

      return config;
    },
  ]);
};

module.exports = withSquareSetup;
