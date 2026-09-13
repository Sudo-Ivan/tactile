// Command publishctl is the reference CLI for tactile-publish nodes:
// create sites, deploy directories, manage domains, inspect usage.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/Sudo-Ivan/tactile/publish/client"
)

func main() {
	var (
		server = flag.String("server", envOr("TACTILE_PUBLISH_SERVER", "http://localhost:8472"), "node base URL")
		key    = flag.String("key", envOr("TACTILE_PUBLISH_KEY", "publish.key"), "Ed25519 private key file (hex, created if absent)")
	)
	flag.Usage = func() {
		_, _ = fmt.Fprintf(flag.CommandLine.Output(), `publishctl - tactile-publish node client

Usage: publishctl [flags] <command> [args]

Commands:
  info                          node info and limits
  pubkey                        print this key's identity
  create <slug> [title]         claim a site slug (does PoW if required)
  deploy <slug> <dir>           tar a directory and deploy it
  sites                         list your sites
  deploys <slug>                list a site's deploys
  rollback <slug> <deploy-id>   restore a previous deploy
  domain add <slug> <domain>    attach domain, prints TXT record
  domain verify <slug> <domain> check TXT and activate
  domain del <slug> <domain>    detach domain
  delete <slug>                 remove a site
  usage                         show usage and limits

Flags:
`)
		flag.PrintDefaults()
	}
	flag.Parse()
	args := flag.Args()
	if len(args) == 0 {
		flag.Usage()
		os.Exit(2)
	}

	priv, err := client.LoadOrCreateKey(*key)
	if err != nil {
		log.Fatalf("key: %v", err)
	}
	c, err := client.New(*server, priv)
	if err != nil {
		log.Fatalf("client: %v", err)
	}
	switch args[0] {
	case "info":
		printJSON(c.Info())
	case "pubkey":
		fmt.Printf("%x\n", c.PubKey())
	case "create":
		need(args, 2, "create <slug> [title]")
		title := ""
		if len(args) > 2 {
			title = args[2]
		}
		printJSON(c.CreateSite(args[1], title))
	case "deploy":
		need(args, 3, "deploy <slug> <dir>")
		dir := filepath.Clean(args[2])
		printJSON(c.DeployDir(args[1], dir))
	case "sites":
		printJSON(c.ListSites())
	case "deploys":
		need(args, 2, "deploys <slug>")
		printJSON(c.ListDeploys(args[1]))
	case "rollback":
		need(args, 3, "rollback <slug> <deploy-id>")
		printJSON(c.Rollback(args[1], args[2]))
	case "domain":
		need(args, 4, "domain <add|verify|del> <slug> <domain>")
		switch args[1] {
		case "add":
			printJSON(c.AddDomain(args[2], args[3]))
		case "verify":
			printJSON(c.VerifyDomain(args[2], args[3]))
		case "del":
			if err := c.DeleteDomain(args[2], args[3]); err != nil {
				log.Fatal(err)
			}
			fmt.Println("deleted")
		default:
			need(args, 0, "domain <add|verify|del> <slug> <domain>")
		}
	case "delete":
		need(args, 2, "delete <slug>")
		if err := c.DeleteSite(args[1]); err != nil {
			log.Fatal(err)
		}
		fmt.Println("deleted")
	case "usage":
		printJSON(c.Usage())
	default:
		flag.Usage()
		os.Exit(2)
	}
}

func need(args []string, n int, usage string) {
	if len(args) < n {
		fmt.Fprintf(os.Stderr, "usage: publishctl %s\n", usage)
		os.Exit(2)
	}
}

func printJSON(v any, err error) {
	if err != nil {
		log.Fatal(err)
	}
	b, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(b))
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
