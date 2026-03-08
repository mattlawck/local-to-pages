<?php
/**
 * Plugin Name: Local to Pages
 * Description: Provides site metadata for llms.txt generation via the Local to Pages add-on.
 * Version:     1.0.0
 * Author:      Matt Lawrence
 * License:     GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

add_action( 'admin_menu', function () {
    add_options_page(
        'Local to Pages',
        'Local to Pages',
        'manage_options',
        'local-to-pages',
        'ltp_settings_page'
    );
} );

add_action( 'admin_init', function () {
    register_setting( 'ltp_settings', 'ltp_options', [
        'sanitize_callback' => 'ltp_sanitize',
    ] );

    add_settings_section( 'ltp_identity', 'Site Identity', null, 'local-to-pages' );

    $fields = [
        'role'           => 'Author Role / Tagline',
        'github_url'     => 'GitHub URL',
        'linkedin_url'   => 'LinkedIn URL',
        'optional_slugs' => 'Optional Page Slugs (comma-separated)',
    ];

    foreach ( $fields as $key => $label ) {
        add_settings_field(
            "ltp_$key",
            $label,
            function () use ( $key ) {
                $options = get_option( 'ltp_options', [] );
                $value   = esc_attr( $options[ $key ] ?? '' );
                echo "<input type='text' name='ltp_options[{$key}]' value='{$value}' class='regular-text'>";
            },
            'local-to-pages',
            'ltp_identity'
        );
    }
} );

function ltp_sanitize( $input ) {
    $clean = [];
    foreach ( [ 'role', 'github_url', 'linkedin_url', 'optional_slugs' ] as $key ) {
        $clean[ $key ] = sanitize_text_field( $input[ $key ] ?? '' );
    }
    return $clean;
}

function ltp_settings_page() {
    ?>
    <div class="wrap">
        <h1>Local to Pages</h1>
        <p>These fields are used by the <strong>Local to Pages</strong> add-on when generating your <code>llms.txt</code> file.</p>
        <form method="post" action="options.php">
            <?php
            settings_fields( 'ltp_settings' );
            do_settings_sections( 'local-to-pages' );
            submit_button();
            ?>
        </form>
    </div>
    <?php
}

// ---------------------------------------------------------------------------
// REST API endpoint — public read, no auth required
// ---------------------------------------------------------------------------

add_action( 'rest_api_init', function () {
    register_rest_route( 'local-to-pages/v1', '/settings', [
        'methods'             => 'GET',
        'callback'            => function () {
            $options        = get_option( 'ltp_options', [] );
            $optional_raw   = $options['optional_slugs'] ?? '';
            $optional_slugs = array_values( array_filter( array_map( 'trim', explode( ',', $optional_raw ) ) ) );

            return rest_ensure_response( [
                'role'           => $options['role'] ?? '',
                'github_url'     => $options['github_url'] ?? '',
                'linkedin_url'   => $options['linkedin_url'] ?? '',
                'optional_slugs' => $optional_slugs,
            ] );
        },
        'permission_callback' => '__return_true',
    ] );
} );
